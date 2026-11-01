import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { matches } from "./conditions.ts";
import { withTenant, type Db } from "./db/client.ts";
import { activities, automationRules, automationRuns, leads, tasks } from "./db/schema.ts";
import { enqueue } from "./jobs/queues.ts";
import { moveStage } from "./leads/stage.ts";

const MAX_DEPTH = 3;

type Rule = typeof automationRules.$inferSelect;
type Trigger = Rule["trigger"];

function triggerApplies(rule: Rule, stageId?: string) {
  return !rule.triggerConfig.stageId || rule.triggerConfig.stageId === stageId;
}

/** A lead enrolls once per rule, when it newly matches. */
export async function handleEvent(tenantId: string, event: Trigger, leadId: string, stageId: string | undefined, depth: number) {
  if (depth >= MAX_DEPTH) return;
  const ruleIds = await withTenant(tenantId, async (db) => {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
    if (!lead) return [];
    const rules = await db
      .select()
      .from(automationRules)
      .where(and(eq(automationRules.active, true), eq(automationRules.trigger, event)));
    const matched = rules.filter((rule) => triggerApplies(rule, stageId) && matches(rule.conditions, lead));
    const enrolled: string[] = [];
    for (const rule of matched) {
      const [run] = await db
        .insert(automationRuns)
        .values({ tenantId, ruleId: rule.id, leadId })
        .onConflictDoNothing()
        .returning({ id: automationRuns.id });
      if (run) enrolled.push(run.id);
    }
    return enrolled;
  });
  for (const runId of ruleIds) await runSteps(tenantId, runId, depth);
}

/** Runs until a wait or the end. Re-checks the lead each time, so a stale rule does nothing. */
export async function runSteps(tenantId: string, runId: string, depth: number) {
  await withTenant(tenantId, async (db) => {
    const [run] = await db.select().from(automationRuns).where(eq(automationRuns.id, runId)).for("update");
    if (!run || run.status !== "running") return;
    const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, run.ruleId));

    let stepIndex = run.stepIndex;
    while (stepIndex < rule.steps.length) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, run.leadId));
      if (!lead || !rule.active || rule.exitStageIds.includes(lead.stageId) || !matches(rule.conditions, lead)) {
        await db.update(automationRuns).set({ status: "exited", stepIndex }).where(eq(automationRuns.id, runId));
        return;
      }
      const step = rule.steps[stepIndex++];
      if (step.type === "wait") {
        await db.update(automationRuns).set({ stepIndex }).where(eq(automationRuns.id, runId));
        await enqueue(db, "automation", { type: "resume", tenantId, runId, depth }, { startAfter: step.minutes * 60 });
        return;
      }
      await applyStep(db, tenantId, lead.id, step, depth);
    }
    await db.update(automationRuns).set({ status: "done", stepIndex }).where(eq(automationRuns.id, runId));
  }, "automation");
}

async function applyStep(db: Db, tenantId: string, leadId: string, step: Rule["steps"][number], depth: number) {
  switch (step.type) {
    case "create_task":
      await db.insert(tasks).values({
        tenantId,
        leadId,
        title: step.title,
        dueAt: new Date(Date.now() + (step.dueInMinutes ?? 0) * 60_000),
      });
      return;
    case "alert":
      await enqueue(db, "telegram", { type: "team_alert", tenantId, leadId, text: step.text });
      return;
    case "move_stage":
      await moveStage(db, tenantId, leadId, step.stageId, "automation", depth + 1);
      return;
    case "assign":
      await db.update(leads).set({ ownerMemberId: step.memberId, updatedAt: sql`now()` }).where(eq(leads.id, leadId));
      return;
    case "tag":
      await db
        .update(leads)
        .set({
          custom: sql`jsonb_set(${leads.custom}, '{tags}', coalesce(${leads.custom}->'tags', '[]'::jsonb) || ${JSON.stringify([step.tag])}::jsonb)`,
        })
        .where(eq(leads.id, leadId));
      await db.insert(activities).values({ tenantId, leadId, kind: "system", body: `Tagged ${step.tag}`, actor: "automation" });
  }
}

/** Finds the time-based triggers: overdue tasks and quiet leads. */
export async function sweep(tenantId: string) {
  const found = await withTenant(tenantId, async (db) => {
    const rules = await db.select().from(automationRules).where(eq(automationRules.active, true));
    const events: { event: Trigger; leadId: string }[] = [];
    if (rules.some((rule) => rule.trigger === "task_overdue")) {
      const rows = await db
        .selectDistinct({ leadId: tasks.leadId })
        .from(tasks)
        .where(and(isNull(tasks.doneAt), lt(tasks.dueAt, new Date())));
      events.push(...rows.map((row) => ({ event: "task_overdue" as const, leadId: row.leadId })));
    }
    for (const rule of rules.filter((candidate) => candidate.trigger === "no_activity")) {
      const days = rule.triggerConfig.days ?? 3;
      const rows = await db
        .select({ leadId: leads.id })
        .from(leads)
        .where(and(eq(leads.status, "open"), sql`${leads.updatedAt} < now() - make_interval(days => ${days})`));
      events.push(...rows.map((row) => ({ event: "no_activity" as const, leadId: row.leadId })));
    }
    return events;
  });
  for (const { event, leadId } of found) await handleEvent(tenantId, event, leadId, undefined, 0);
}
