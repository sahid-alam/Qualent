import { eq, sql, type SQL } from "drizzle-orm";
import { GRAPH_URL } from "./capi/send.ts";
import { decryptSecret } from "./crypto.ts";
import { withTenant } from "./db/client.ts";
import { adInsightsDaily, connections } from "./db/schema.ts";
import { alertOps } from "./ops.ts";
import type { Membership } from "./permissions.ts";
import { getTenant } from "./tenants.ts";

type Insight = {
  date_start: string;
  campaign_id: string;
  campaign_name?: string;
  adset_id: string;
  adset_name?: string;
  ad_id: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
};

const INSIGHT_FIELDS = "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions";

/** Re-reads recent days, because Meta restates numbers. Safe to run repeatedly. */
export async function syncSpend(tenantId: string, days = 3) {
  const accounts = await withTenant(tenantId, (db) => db.select().from(connections).where(eq(connections.kind, "ad_account")));
  let rows = 0;
  for (const account of accounts) {
    if (!account.secretEncrypted) continue;
    let next: string | undefined =
      `${GRAPH_URL}/${account.externalId}/insights?level=ad&time_increment=1&date_preset=last_${days}d&limit=200&fields=${INSIGHT_FIELDS},account_currency`;
    const token = decryptSecret(account.secretEncrypted);
    while (next) {
      const response: Response = await fetch(next, { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        await withTenant(tenantId, (db) =>
          db.update(connections).set({ status: "error", lastError: detail }).where(eq(connections.id, account.id)),
        );
        await alertOps(`Spend sync failed for tenant ${tenantId}: ${response.status}`);
        break;
      }
      const page = (await response.json()) as { data: (Insight & { account_currency?: string })[]; paging?: { next?: string } };
      await withTenant(tenantId, async (db) => {
        const tenant = await getTenant(db, tenantId);
        for (const insight of page.data) {
          const values = {
            tenantId,
            date: insight.date_start,
            campaignId: insight.campaign_id,
            campaignName: insight.campaign_name,
            adsetId: insight.adset_id,
            adsetName: insight.adset_name,
            adId: insight.ad_id,
            adName: insight.ad_name,
            spend: insight.spend ?? "0",
            currency: insight.account_currency ?? tenant.currency,
            impressions: Number(insight.impressions ?? 0),
            clicks: Number(insight.clicks ?? 0),
            leads: Number(insight.actions?.find((action) => action.action_type === "lead")?.value ?? 0),
          };
          await db
            .insert(adInsightsDaily)
            .values(values)
            .onConflictDoUpdate({ target: [adInsightsDaily.tenantId, adInsightsDaily.date, adInsightsDaily.adId], set: values });
          rows++;
        }
      });
      next = page.paging?.next;
    }
  }
  return rows;
}

const MANUAL = "__manual__";

/** Report dates are the client's calendar days, so a lead at 01:00 in Dubai counts on that day. */
const inRange = (column: SQL, tenantId: string, from: string, to: string) =>
  sql`(${column} at time zone (select timezone from tenants where id = ${tenantId}::uuid))::date between ${from}::date and ${to}::date`;

/**
 * Leads, qualified, deals and cost per campaign. Numbers only, safe for clients.
 * Leads with no campaign id, or typed in by hand, are grouped and labeled as manual.
 */
export async function campaignReport(tenantId: string, from: string, to: string) {
  return withTenant(tenantId, async (db) => {
    const leadRows = await db.execute<{ campaign: string; leads: number; qualified: number; won: number }>(sql`
      with first_touch as (
        select distinct on (lead_id) lead_id, campaign_id, source
        from touches order by lead_id, occurred_at
      )
      select
        case when t.source in ('manual', 'csv') or t.campaign_id is null then ${MANUAL} else t.campaign_id end as campaign,
        count(*)::int as leads,
        count(*) filter (where exists (
          select 1 from stage_history h join stages s on s.id = h.stage_id
          where h.lead_id = l.id and s.kind in ('qualified', 'won')
        ))::int as qualified,
        count(*) filter (where l.status = 'won')::int as won
      from leads l join first_touch t on t.lead_id = l.id
      where ${inRange(sql`l.created_at`, tenantId, from, to)}
        and not coalesce(l.custom @> '{"test": true}', false)
      group by 1
    `);
    const spendRows = await db
      .select({
        campaign: adInsightsDaily.campaignId,
        name: sql<string | null>`max(${adInsightsDaily.campaignName})`,
        spend: sql<string>`sum(${adInsightsDaily.spend})`,
        currency: sql<string>`max(${adInsightsDaily.currency})`,
      })
      .from(adInsightsDaily)
      .where(sql`${adInsightsDaily.date} between ${from} and ${to}`)
      .groupBy(adInsightsDaily.campaignId);

    const spendBy = new Map(spendRows.map((row) => [row.campaign, row]));
    const ids = new Set([...leadRows.rows.map((row) => row.campaign), ...spendBy.keys()]);
    const countsBy = new Map(leadRows.rows.map((row) => [row.campaign, row]));
    const per = (spend: number, count: number) => (count ? Math.round((spend / count) * 100) / 100 : null);

    const campaigns = [...ids].map((campaign) => {
      const counts = countsBy.get(campaign) ?? { leads: 0, qualified: 0, won: 0 };
      const spendRow = spendBy.get(campaign);
      const spend = Number(spendRow?.spend ?? 0);
      return {
        campaignId: campaign === MANUAL ? null : campaign,
        name: campaign === MANUAL ? "Manual entries" : (spendRow?.name ?? campaign),
        manual: campaign === MANUAL,
        spend,
        currency: spendRow?.currency ?? null,
        leads: counts.leads,
        qualified: counts.qualified,
        won: counts.won,
        costPerLead: per(spend, counts.leads),
        costPerQualified: per(spend, counts.qualified),
        costPerDeal: per(spend, counts.won),
      };
    });
    return { from, to, campaigns };
  });
}

export async function teamReport(tenantId: string, from: string, to: string) {
  return withTenant(tenantId, async (db) => {
    const people = await db.execute<{ member_id: string; name: string; leads: number; avg_response_minutes: number | null }>(sql`
      select m.id as member_id, m.name, count(l.id)::int as leads,
        round(avg(extract(epoch from l.first_response_at - l.assigned_at) / 60)::numeric, 1)::float as avg_response_minutes
      from members m
      left join leads l on l.owner_member_id = m.id and ${inRange(sql`l.created_at`, tenantId, from, to)}
        and not coalesce(l.custom @> '{"test": true}', false)
      where m.role in ('manager', 'agent')
      group by m.id, m.name order by leads desc
    `);
    const funnel = await db.execute<{ stage_id: string; name: string; position: number; leads: number }>(sql`
      select s.id as stage_id, s.name, s.position, count(distinct h.lead_id)::int as leads
      from stages s
      left join stage_history h on h.stage_id = s.id and ${inRange(sql`h.entered_at`, tenantId, from, to)}
      group by s.id, s.name, s.position order by s.position
    `);
    return { from, to, people: people.rows, funnel: funnel.rows };
  });
}

type Scope = Pick<Membership, "memberId" | "recordScope">;

/** Leads per day, temperature mix and speed for a date range. Staff limited to their own leads see only those. */
export async function leadSummary(tenantId: string, from: string, to: string, scope: Scope = { memberId: null, recordScope: "all" }) {
  const where = sql`${inRange(sql`l.created_at`, tenantId, from, to)}
    and not coalesce(l.custom @> '{"test": true}', false)
    ${scope.recordScope === "assigned" ? sql`and l.owner_member_id = ${scope.memberId}::uuid` : sql``}`;
  return withTenant(tenantId, async (db) => {
    const rows = await db.execute<{ day: string; temperature: "hot" | "warm" | "cold" | null; leads: number }>(sql`
      select (l.created_at at time zone (select timezone from tenants where id = ${tenantId}::uuid))::date::text as day, l.temperature, count(*)::int as leads
      from leads l where ${where} group by 1, 2
    `);
    const [totals] = (
      await db.execute<{ median_reply: number | null; qualified: number; won: number }>(sql`
        select
          percentile_cont(0.5) within group (order by extract(epoch from l.first_response_at - l.created_at) / 60)::float as median_reply,
          count(*) filter (where exists (
            select 1 from stage_history h join stages s on s.id = h.stage_id
            where h.lead_id = l.id and s.kind in ('qualified', 'won')
          ))::int as qualified,
          count(*) filter (where l.status = 'won')::int as won
        from leads l where ${where}
      `)
    ).rows;

    const perDay = new Map<string, number>();
    const temperature = { hot: 0, warm: 0, cold: 0, unscored: 0 };
    for (const row of rows.rows) {
      perDay.set(row.day, (perDay.get(row.day) ?? 0) + row.leads);
      temperature[row.temperature ?? "unscored"] += row.leads;
    }
    const days: { date: string; leads: number }[] = [];
    for (let day = Date.parse(from); day <= Date.parse(to); day += 86_400_000) {
      const date = new Date(day).toISOString().slice(0, 10);
      days.push({ date, leads: perDay.get(date) ?? 0 });
    }
    return { days, temperature, total: days.reduce((sum, day) => sum + day.leads, 0), medianReplyMinutes: totals.median_reply, qualified: totals.qualified, won: totals.won };
  });
}
