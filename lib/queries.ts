import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
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
export function listInbox(tenantId: string) {
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
