import { and, asc, count, desc, eq, gt, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { withTenant } from "./db/client.ts";
import { adInsightsDaily, contacts, leads, members, stages, touches } from "./db/schema.ts";
import type { Membership } from "./permissions.ts";

/** Campaigns we have spend for, for pickers and filters. */
export function listCampaigns(tenantId: string) {
  return withTenant(tenantId, async (db) => {
    const rows = await db
      .select({ id: adInsightsDaily.campaignId, name: sql<string>`max(${adInsightsDaily.campaignName})` })
      .from(adInsightsDaily)
      .groupBy(adInsightsDaily.campaignId)
      .orderBy(sql`2`);
    return rows.map((row) => ({ id: row.id, name: row.name ?? row.id }));
  });
}

export function listRoutableMembers(tenantId: string) {
  return withTenant(tenantId, (db) =>
    db.select().from(members).where(and(eq(members.active, true), inArray(members.role, ["manager", "agent"]))).orderBy(asc(members.name)),
  );
}

export function listFieldAgents(tenantId: string) {
  return withTenant(tenantId, (db) => db.select().from(members).where(and(eq(members.active, true), eq(members.role, "field_agent"))).orderBy(asc(members.name)));
}

/** New, unassigned leads with their first touch. */
export async function listInbox(tenantId: string, membership: Pick<Membership, "recordScope">) {
  // Unowned leads aren't theirs, so staff limited to their own leads don't see them.
  if (membership.recordScope === "assigned") return [];
  return withTenant(tenantId, async (db) => {
    const rows = await db
      .select({ lead: leads, contact: contacts })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(and(isNull(leads.ownerMemberId), eq(leads.status, "open")))
      .orderBy(asc(leads.createdAt))
      .limit(200);
    return withFirstTouch(tenantId, rows);
  });
}

async function withFirstTouch<T extends { lead: { id: string } }>(tenantId: string, rows: T[]) {
  if (!rows.length) return rows.map((row) => ({ ...row, touch: undefined as typeof touches.$inferSelect | undefined }));
  const all = await withTenant(tenantId, (db) =>
    db.select().from(touches).where(inArray(touches.leadId, rows.map((row) => row.lead.id))).orderBy(desc(touches.occurredAt)),
  );
  const first = new Map(all.map((touch) => [touch.leadId, touch]));
  return rows.map((row) => ({ ...row, touch: first.get(row.lead.id) }));
}

/** Open leads and recently closed ones, for the board. */
export function listBoard(tenantId: string, membership: Pick<Membership, "memberId" | "recordScope">) {
  return withTenant(tenantId, async (db) => {
    const [pipeline] = await db.select().from(stages).limit(1);
    const rows = await db
      .select({ lead: leads, contact: contacts })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(
        and(
          or(eq(leads.status, "open"), sql`${leads.updatedAt} > now() - interval '30 days'`),
          membership.recordScope === "assigned" ? eq(leads.ownerMemberId, membership.memberId ?? "") : undefined,
        ),
      )
      .orderBy(sql`${leads.score} desc nulls last`, desc(leads.createdAt))
      .limit(500);
    return { rows, hasStages: !!pipeline };
  });
}

export function countByStatus(tenantId: string) {
  return withTenant(tenantId, (db) => db.select({ status: leads.status, count: count() }).from(leads).groupBy(leads.status));
}

type Scope = Pick<Membership, "memberId" | "recordScope">;

const ownLeads = (scope: Scope) => (scope.recordScope === "assigned" ? eq(leads.ownerMemberId, scope.memberId ?? "") : undefined);

/** Nobody has called, noted or delivered yet, or delivery failed and it came back to us. */
const NEEDS_YOU = sql`(${leads.status} = 'open' and ((${leads.firstResponseAt} is null and ${leads.deliveredAt} is null) or ${leads.deliveryFailedAt} is not null))`;
const WAITING = sql`(${leads.status} = 'open' and not ((${leads.firstResponseAt} is null and ${leads.deliveredAt} is null) or ${leads.deliveryFailedAt} is not null))`;
const RECENT = sql`now() - interval '7 days'`;

export type QueueTab = "needs" | "waiting" | "done";

const TAB_WHERE: Record<QueueTab, SQL | undefined> = {
  needs: NEEDS_YOU,
  waiting: WAITING,
  done: and(ne(leads.status, "open"), gt(leads.updatedAt, RECENT)),
};

export function queueCounts(tenantId: string, scope: Scope) {
  const needing = (extra: SQL) => sql<number>`count(*) filter (where ${NEEDS_YOU} and ${extra})::int`;
  return withTenant(tenantId, async (db) => {
    const [row] = await db
      .select({
        needs: sql<number>`count(*) filter (where ${NEEDS_YOU})::int`,
        hot: needing(sql`${leads.temperature} = 'hot'`),
        warm: needing(sql`${leads.temperature} = 'warm'`),
        cold: needing(sql`${leads.temperature} = 'cold'`),
        unscored: needing(sql`${leads.temperature} is null`),
        waiting: sql<number>`count(*) filter (where ${WAITING})::int`,
        done: sql<number>`count(*) filter (where ${TAB_WHERE.done})::int`,
        unowned: sql<number>`count(*) filter (where ${leads.status} = 'open' and ${leads.ownerMemberId} is null)::int`,
      })
      .from(leads)
      .where(ownLeads(scope));
    return row;
  });
}

/** Highest score first, then whoever has waited longest. */
export function listQueue(tenantId: string, scope: Scope, options: { tab?: QueueTab; temperature?: "hot" | "warm" | "cold"; limit?: number } = {}) {
  return withTenant(tenantId, async (db) => {
    const rows = await db
      .select({ lead: leads, contact: contacts })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(and(ownLeads(scope), TAB_WHERE[options.tab ?? "needs"], options.temperature ? eq(leads.temperature, options.temperature) : undefined))
      .orderBy(sql`${leads.score} desc nulls last`, asc(leads.createdAt))
      .limit(options.limit ?? 100);
    return withFirstTouch(tenantId, rows);
  });
}
