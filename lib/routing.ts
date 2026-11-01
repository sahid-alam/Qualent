import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { isWithinHours, matches, pickByWeight } from "./conditions.ts";
import { withTenant, type Db } from "./db/client.ts";
import { activities, leads, members, routingRules, stages, touches } from "./db/schema.ts";
import { enqueue } from "./jobs/queues.ts";
import { getTenant } from "./tenants.ts";

const OUT_OF_HOURS_RETRY_SECONDS = 900;
const DEFAULT_AGENT_SLA_MINUTES = 60;
const MAX_AGENT_REDELIVERIES = 2;

/** A reason written for the person sending the lead. */
export class DeliveryError extends Error {}

const alertTeam = (db: Db, tenantId: string, leadId: string, reason: string) =>
  enqueue(db, "telegram", { type: "team_alert", tenantId, leadId, reason });

export async function assignLead(tenantId: string, leadId: string, retried = false) {
  await withTenant(tenantId, async (db) => {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).for("update");
    if (!lead || lead.ownerMemberId) return;

    const [touch] = await db.select().from(touches).where(eq(touches.leadId, leadId)).orderBy(asc(touches.occurredAt)).limit(1);
    const rules = await db.select().from(routingRules).where(eq(routingRules.active, true)).orderBy(asc(routingRules.position));
    const rule = rules.find((candidate) => matches(candidate.conditions, { ...lead, touch }));
    if (!rule) return alertTeam(db, tenantId, leadId, "new_unassigned");

    const tenant = await getTenant(db, tenantId);
    const candidates = await routable(db, rule.memberIds);
    const onDuty = candidates.filter((member) => isWithinHours(member.workingHours, tenant.timezone));
    if (!onDuty.length) {
      // Stays in the inbox and tries again. Alert once only.
      if (!retried) await alertTeam(db, tenantId, leadId, "out_of_hours");
      await enqueue(db, "routing", { type: "assign", tenantId, leadId, retried: true }, { startAfter: OUT_OF_HOURS_RETRY_SECONDS });
      return;
    }

    const member = pickByWeight(onDuty, rule.counters);
    await giveTo(db, tenantId, leadId, member.id, rule, "assigned");
    await alertTeam(db, tenantId, leadId, "new_lead");
  });
}

const routable = (db: Db, ids: string[]) =>
  ids.length
    ? db
        .select()
        .from(members)
        .where(and(inArray(members.id, ids), eq(members.active, true), inArray(members.role, ["manager", "agent"])))
        .orderBy(asc(members.createdAt))
    : Promise.resolve([]);

async function giveTo(db: Db, tenantId: string, leadId: string, memberId: string, rule: typeof routingRules.$inferSelect, verb: string) {
  const counters = { ...rule.counters, [memberId]: (rule.counters[memberId] ?? 0) + 1 };
  await db.update(routingRules).set({ counters }).where(eq(routingRules.id, rule.id));
  await db.update(leads).set({ ownerMemberId: memberId, assignedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(leads.id, leadId));
  await db.insert(activities).values({ tenantId, leadId, kind: "assignment", body: verb, data: { memberId } });
  await enqueue(
    db,
    "routing",
    { type: "reply_timer", tenantId, leadId, memberId, ruleId: rule.id },
    { startAfter: rule.slaMinutes * 60 },
  );
}

/** The reply timer. Moves the lead on, and stops at the manager so it never loops. */
export async function checkReplyTimer(tenantId: string, leadId: string, memberId: string, ruleId: string) {
  await withTenant(tenantId, async (db) => {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).for("update");
    if (!lead || lead.firstResponseAt || lead.ownerMemberId !== memberId || lead.status !== "open") return;

    const [rule] = await db.select().from(routingRules).where(eq(routingRules.id, ruleId));
    if (!rule) return;

    const tenant = await getTenant(db, tenantId);
    const others = (await routable(db, rule.memberIds)).filter(
      (member) => member.id !== memberId && isWithinHours(member.workingHours, tenant.timezone),
    );

    if (lead.reassignCount >= rule.maxReassigns || !others.length) {
      if (rule.escalateToMemberId && rule.escalateToMemberId !== memberId) {
        await db.update(leads).set({ ownerMemberId: rule.escalateToMemberId, updatedAt: sql`now()` }).where(eq(leads.id, leadId));
      }
      await db.insert(activities).values({ tenantId, leadId, kind: "assignment", body: "escalated", data: { memberId: rule.escalateToMemberId } });
      return alertTeam(db, tenantId, leadId, "no_reply_escalated");
    }

    await db.update(leads).set({ reassignCount: sql`${leads.reassignCount} + 1` }).where(eq(leads.id, leadId));
    await giveTo(db, tenantId, leadId, pickByWeight(others, rule.counters).id, rule, "reassigned, no reply");
    await alertTeam(db, tenantId, leadId, "no_reply_reassigned");
  });
}

/** Staff qualified this lead. Sends it to the client's sales agent on Telegram. */
export async function deliverLead(tenantId: string, leadId: string, memberId: string, actor: string) {
  await withTenant(
    tenantId,
    async (db) => {
      const [agent] = await db
        .select()
        .from(members)
        .where(and(eq(members.id, memberId), eq(members.role, "field_agent"), eq(members.active, true)));
      if (!agent) throw new DeliveryError("Not an active client agent");
      if (!agent.telegramChatId) throw new DeliveryError("This agent has not linked Telegram");
      await sendToAgent(db, tenantId, leadId, agent.id, actor);
    },
    actor,
  );
}

async function sendToAgent(db: Db, tenantId: string, leadId: string, memberId: string, actor: string) {
  await db
    .update(leads)
    .set({ deliveredToMemberId: memberId, deliveredAt: sql`now()`, deliveryFailedAt: null, agentResponseAt: null, updatedAt: sql`now()` })
    .where(eq(leads.id, leadId));
  await db.insert(activities).values({ tenantId, leadId, kind: "delivery", body: "Sent to client agent", data: { memberId }, actor });
  await enqueue(db, "telegram", { type: "delivery", tenantId, leadId, memberId });

  const [lead] = await db.select({ stageId: leads.stageId }).from(leads).where(eq(leads.id, leadId));
  const [stage] = await db.select({ sla: stages.slaMinutes }).from(stages).where(eq(stages.id, lead.stageId));
  await enqueue(
    db,
    "routing",
    { type: "agent_timer", tenantId, leadId, memberId },
    { startAfter: (stage?.sla ?? DEFAULT_AGENT_SLA_MINUTES) * 60 },
  );
}

/** A client agent ignored the lead: try the next one, then tell staff. */
export async function checkAgentTimer(tenantId: string, leadId: string, memberId: string) {
  await withTenant(tenantId, async (db) => {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).for("update");
    if (!lead || lead.agentResponseAt || lead.deliveredToMemberId !== memberId || lead.status !== "open") return;

    const tried = await db
      .select({ data: activities.data })
      .from(activities)
      .where(and(eq(activities.leadId, leadId), eq(activities.kind, "delivery")));
    const triedIds = tried.map((row) => row.data.memberId as string);

    const [next] = await db
      .select()
      .from(members)
      .where(and(eq(members.role, "field_agent"), eq(members.active, true), ne(members.id, memberId)))
      .orderBy(asc(members.createdAt))
      .then((rows) => rows.filter((row) => row.telegramChatId && !triedIds.includes(row.id)));

    if (!next || tried.length > MAX_AGENT_REDELIVERIES) return alertTeam(db, tenantId, leadId, "agent_no_reply");
    await sendToAgent(db, tenantId, leadId, next.id, "system");
  });
}
