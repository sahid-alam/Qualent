import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { resolveBrand, type Brand } from "./brand.ts";
import { GRAPH_URL, hashEmail } from "./capi/send.ts";
import { decryptSecret } from "./crypto.ts";
import { withTenant, withUser, type Db } from "./db/client.ts";
import {
  adAnalyses,
  aiModels,
  aiUsage,
  automationRules,
  connections,
  customFieldDefs,
  leads,
  members,
  pipelines,
  profiles,
  routingRules,
  STAGE_KINDS,
  stageHistory,
  stages,
  tenants,
  type AutomationStep,
  type Condition,
  type Role,
} from "./db/schema.ts";
import { ingestLead } from "./leads/ingest.ts";
import { STATUS_BY_KIND } from "./leads/stage.ts";
import { assignLead } from "./routing.ts";
import { telegramConfigured } from "./telegram/api.ts";

export function listMembers(tenantId: string) {
  return withTenant(tenantId, (db) => db.select().from(members).orderBy(asc(members.createdAt)));
}

export function addPerson(
  tenantId: string,
  input: { name: string; role: Role; email?: string | null; recordScope?: "all" | "assigned"; weight?: number },
  actor: string,
) {
  // Client agents have no login, so no email.
  const inviteEmail = input.role === "field_agent" ? null : input.email?.trim().toLowerCase() || null;
  return withTenant(
    tenantId,
    async (db) => {
      if (inviteEmail) {
        const [taken] = await db.select({ id: members.id }).from(members).where(eq(members.inviteEmail, inviteEmail));
        if (taken) return null;
      }
      return db
        .insert(members)
        .values({ tenantId, name: input.name, role: input.role, inviteEmail, recordScope: input.recordScope ?? "all", weight: input.weight ?? 1 })
        .returning()
        .then(([row]) => row);
    },
    actor,
  );
}

export function updatePerson(
  tenantId: string,
  memberId: string,
  values: Pick<typeof members.$inferInsert, "weight" | "recordScope" | "workingHours">,
  actor: string,
) {
  return withTenant(tenantId, (db) => db.update(members).set(values).where(eq(members.id, memberId)), actor);
}

export function setPersonActive(tenantId: string, memberId: string, active: boolean, actor: string) {
  return withTenant(tenantId, (db) => db.update(members).set({ active }).where(eq(members.id, memberId)), actor);
}

/** Links invites to a person on sign-in. Call only with an email the auth provider has verified. */
export async function claimInvites(userId: string, verifiedEmail: string) {
  const email = verifiedEmail.toLowerCase();
  const invites = await withUser(
    userId,
    (db) => db.select().from(members).where(and(isNull(members.userId), eq(members.inviteEmail, email))),
    email,
  );
  for (const invite of invites) {
    await withTenant(
      invite.tenantId,
      async (db) => {
        // Added twice, or added again after leaving: the existing link stands, and sign-in must not fail.
        const [existing] = await db.select({ id: members.id }).from(members).where(eq(members.userId, userId));
        if (existing) return;
        await db
          .update(members)
          .set({ userId, inviteEmail: null })
          .where(and(eq(members.id, invite.id), isNull(members.userId)));
      },
      `user:${userId}`,
    );
  }
  // The first sign-in creates the name shown in the sidebar.
  await withUser(userId, (db) => db.insert(profiles).values({ id: userId, name: invites[0]?.name ?? email.split("@")[0] }).onConflictDoNothing());
  return invites;
}

export function listRoutingRules(tenantId: string) {
  return withTenant(tenantId, (db) => db.select().from(routingRules).orderBy(asc(routingRules.position)));
}

export function saveRoutingRule(
  tenantId: string,
  input: { memberIds: string[]; slaMinutes: number; maxReassigns: number; escalateToMemberId?: string | null; conditions?: Condition[] },
  actor: string,
) {
  return withTenant(
    tenantId,
    async (db) => {
      const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${routingRules.position}), -1)::int + 1` }).from(routingRules);
      return db
        .insert(routingRules)
        .values({ tenantId, position: next, ...input, conditions: input.conditions ?? [] })
        .returning()
        .then(([row]) => row);
    },
    actor,
  );
}

export function deleteRoutingRule(tenantId: string, id: string, actor: string) {
  return withTenant(tenantId, (db) => db.delete(routingRules).where(eq(routingRules.id, id)), actor);
}

export function listAutomations(tenantId: string) {
  return withTenant(tenantId, (db) => db.select().from(automationRules).orderBy(asc(automationRules.name)));
}

export function saveAutomation(
  tenantId: string,
  input: {
    name: string;
    trigger: (typeof automationRules.$inferInsert)["trigger"];
    triggerConfig: { stageId?: string; days?: number };
    conditions?: Condition[];
    steps: AutomationStep[];
    exitStageIds: string[];
  },
  actor: string,
) {
  return withTenant(tenantId, (db) => db.insert(automationRules).values({ tenantId, ...input }).returning().then(([row]) => row), actor);
}

export function setAutomationActive(tenantId: string, id: string, active: boolean, actor: string) {
  return withTenant(tenantId, (db) => db.update(automationRules).set({ active }).where(eq(automationRules.id, id)), actor);
}

export function listPipelines(tenantId: string) {
  return withTenant(tenantId, async (db) => {
    const allPipelines = await db.select().from(pipelines).orderBy(desc(pipelines.isDefault));
    const allStages = await db.select().from(stages).orderBy(asc(stages.position));
    return allPipelines.map((pipeline) => ({ ...pipeline, stages: allStages.filter((stage) => stage.pipelineId === pipeline.id) }));
  });
}

export function updateStage(
  tenantId: string,
  stageId: string,
  values: Partial<Pick<typeof stages.$inferInsert, "capiEnabled" | "capiEventName" | "agentButton" | "slaMinutes">>,
  actor: string,
) {
  return withTenant(tenantId, (db) => db.update(stages).set(values).where(eq(stages.id, stageId)), actor);
}

/** A reason written for the person changing the pipeline. */
export class StageError extends Error {}

/** New leads start in the first stage, so it can't count as a result. */
async function requireOpenFirstStage(db: Db, pipelineId: string) {
  const [first] = await db.select().from(stages).where(eq(stages.pipelineId, pipelineId)).orderBy(asc(stages.position)).limit(1);
  if (first?.kind !== "open") throw new StageError("The first stage has to be an open one, because new leads start there.");
}

export function saveStage(tenantId: string, stageId: string, input: { name: string; kind: (typeof STAGE_KINDS)[number] }, actor: string) {
  return withTenant(
    tenantId,
    async (db) => {
      const [stage] = await db.update(stages).set(input).where(eq(stages.id, stageId)).returning();
      if (!stage) throw new StageError("That stage no longer exists.");
      await requireOpenFirstStage(db, stage.pipelineId);
      // Leads already here follow the stage's new meaning, so reports stay right.
      await db.update(leads).set({ status: STATUS_BY_KIND[stage.kind] }).where(eq(leads.stageId, stageId));
    },
    actor,
  );
}

export function addStage(tenantId: string, input: { name: string; kind: (typeof STAGE_KINDS)[number] }, actor: string) {
  return withTenant(
    tenantId,
    async (db) => {
      const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.isDefault, true)).limit(1);
      const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${stages.position}), -1)::int + 1` }).from(stages).where(eq(stages.pipelineId, pipeline.id));
      await db.insert(stages).values({ tenantId, pipelineId: pipeline.id, position: next, capiEventName: input.name, ...input });
    },
    actor,
  );
}

/** Swaps with the neighbour. Every drag on this list has this as its keyboard version. */
export function shiftStage(tenantId: string, stageId: string, direction: "up" | "down", actor: string) {
  return withTenant(
    tenantId,
    async (db) => {
      const [stage] = await db.select().from(stages).where(eq(stages.id, stageId));
      if (!stage) throw new StageError("That stage no longer exists.");
      const all = await db.select().from(stages).where(eq(stages.pipelineId, stage.pipelineId)).orderBy(asc(stages.position));
      const neighbour = all[all.findIndex((row) => row.id === stageId) + (direction === "up" ? -1 : 1)];
      if (!neighbour) return;
      // Positions are unique, so one needs parking while they swap.
      await db.update(stages).set({ position: -1 }).where(eq(stages.id, stage.id));
      await db.update(stages).set({ position: stage.position }).where(eq(stages.id, neighbour.id));
      await db.update(stages).set({ position: neighbour.position }).where(eq(stages.id, stage.id));
      await requireOpenFirstStage(db, stage.pipelineId);
    },
    actor,
  );
}

/** Only a stage nothing depends on, so history, reports and Meta events keep their meaning. */
export function deleteStage(tenantId: string, stageId: string, actor: string) {
  return withTenant(
    tenantId,
    async (db) => {
      const [{ used }] = await db.select({ used: sql<number>`count(*)::int` }).from(stageHistory).where(eq(stageHistory.stageId, stageId));
      if (used) throw new StageError("Leads have been through this stage, so it stays for their history. You can rename it.");
      const rules = await db.select().from(automationRules);
      if (rules.some((rule) => JSON.stringify([rule.triggerConfig, rule.steps, rule.exitStageIds]).includes(stageId))) {
        throw new StageError("An automation uses this stage. Change that rule first.");
      }
      const [stage] = await db.delete(stages).where(eq(stages.id, stageId)).returning();
      if (stage) await requireOpenFirstStage(db, stage.pipelineId);
    },
    actor,
  );
}

export function listCustomFields(tenantId: string) {
  return withTenant(tenantId, (db) => db.select().from(customFieldDefs).orderBy(asc(customFieldDefs.label)));
}

export function saveCustomField(tenantId: string, input: Omit<typeof customFieldDefs.$inferInsert, "tenantId" | "id">, actor: string) {
  return withTenant(tenantId, (db) => db.insert(customFieldDefs).values({ tenantId, ...input }).onConflictDoNothing().returning({ id: customFieldDefs.id }).then(([row]) => !!row), actor);
}

/** Values already on leads stay in place, and come back if the field does. */
export function deleteCustomField(tenantId: string, id: string, actor: string) {
  return withTenant(tenantId, (db) => db.delete(customFieldDefs).where(eq(customFieldDefs.id, id)), actor);
}

export function updateTenantSettings(tenantId: string, values: Pick<typeof tenants.$inferInsert, "timezone" | "currency" | "retentionDays" | "aiMonthlyBudgetUsd">, actor: string) {
  return withTenant(tenantId, (db) => db.update(tenants).set(values).where(eq(tenants.id, tenantId)), actor);
}

export function aiSpendThisMonth(tenantId: string) {
  return withTenant(tenantId, (db) =>
    db
      .select({ spent: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
      .from(aiUsage)
      .where(sql`${aiUsage.at} >= date_trunc('month', now())`)
      .then(([row]) => Number(row.spent)),
  );
}

export function setBrand(tenantId: string, input: { name?: string; color?: string; logo?: string }, actor: string) {
  return withTenant(
    tenantId,
    async (db) => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
      const resolved = input.color ? resolveBrand(input.color) : {};
      const brand: Brand = { ...(tenant.brand as Brand), ...resolved, ...(input.name ? { name: input.name } : {}), ...(input.logo ? { logo: input.logo } : {}) };
      await db.update(tenants).set({ brand }).where(eq(tenants.id, tenantId));
      return brand;
    },
    actor,
  );
}

export function setIntakeOrigins(tenantId: string, origins: string[], actor: string) {
  return withTenant(tenantId, (db) => db.update(tenants).set({ intakeOrigins: origins }).where(eq(tenants.id, tenantId)), actor);
}

/** Every line of the client setup checklist, worked out from what actually exists. */
export function setupStatus(tenantId: string) {
  return withTenant(tenantId, async (db) => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    const allConnections = await db.select().from(connections);
    const people = await db.select().from(members).where(eq(members.active, true));
    const [{ rules }] = await db.select({ rules: sql<number>`count(*)::int` }).from(routingRules).where(eq(routingRules.active, true));
    const connection = (kind: "page" | "dataset" | "ad_account") => {
      const found = allConnections.filter((row) => row.kind === kind);
      if (!found.length) return { state: "todo" as const, detail: null };
      const broken = found.find((row) => row.status === "error");
      return broken ? { state: "problem" as const, detail: broken.lastError } : { state: "done" as const, detail: found[0].name ?? found[0].externalId };
    };
    const agents = people.filter((person) => person.role === "field_agent");
    const account = allConnections.find((row) => row.kind === "ad_account")?.config as { currency?: string; timezone?: string } | undefined;
    const mismatch = [
      account?.currency && account.currency !== tenant.currency ? `reports in ${account.currency}, this client uses ${tenant.currency}` : null,
      account?.timezone && account.timezone !== tenant.timezone ? `runs on ${account.timezone}, this client is on ${tenant.timezone}` : null,
    ].filter(Boolean);
    return {
      tenant,
      adAccountWarning: mismatch.length ? `This ad account ${mismatch.join(" and ")}. Spend won't line up with leads.` : null,
      connections: allConnections,
      page: connection("page"),
      dataset: connection("dataset"),
      adAccount: connection("ad_account"),
      teamGroup: tenant.telegramTeamChatId ? ("done" as const) : ("todo" as const),
      people: people.length,
      agentsLinked: agents.filter((agent) => agent.telegramChatId).length,
      agents: agents.length,
      rules,
      telegramConfigured: telegramConfigured(),
    };
  });
}

/** Runs a fake lead through intake and routing, then reports each step. */
export async function sendTestLead(tenantId: string, actor: string) {
  const stamp = Date.now();
  const { leadId } = await ingestLead(tenantId, {
    source: "manual",
    name: "Test Lead",
    email: `test-${stamp}@example.invalid`,
    custom: { test: true },
    note: "Created by the setup test. Safe to erase.",
    actor,
  });
  await assignLead(tenantId, leadId);
  const status = await setupStatus(tenantId);
  const [lead] = await withTenant(tenantId, (db) => db.select().from(leads).where(eq(leads.id, leadId)));
  return {
    leadId,
    arrived: true,
    assigned: !!lead.ownerMemberId,
    alert: status.telegramConfigured && status.teamGroup === "done",
    dataset: status.dataset.state === "done",
  };
}

/** A fake event with a test code, so it never counts as a live result. */
export async function sendTestEvent(tenantId: string, code: string) {
  if (process.env.VERCEL_ENV === "production") return { ok: false, message: "Test events only run on staging, so they can't affect live ads." };
  const dataset = await withTenant(tenantId, (db) =>
    db.select().from(connections).where(eq(connections.kind, "dataset")).then(([row]) => row),
  );
  if (!dataset?.secretEncrypted) return { ok: false, message: "Connect a Meta dataset first." };
  const response = await fetch(`${GRAPH_URL}/${dataset.externalId}/events`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${decryptSecret(dataset.secretEncrypted)}` },
    body: JSON.stringify({
      test_event_code: code,
      data: [
        {
          event_name: "Lead",
          event_time: Math.floor(Date.now() / 1000),
          event_id: `test-${Date.now()}`,
          action_source: "system_generated",
          user_data: { em: [hashEmail("test@example.invalid")] },
          custom_data: { event_source: "crm", lead_event_source: "Qualent" },
        },
      ],
    }),
  });
  return response.ok
    ? { ok: true, message: "Sent. Check the Test events tab in Meta's Events Manager." }
    : { ok: false, message: `Meta rejected it (${response.status}). Check the dataset id and token.` };
}

export function hasAiModel(tenantId: string, task: string) {
  return withTenant(tenantId, async (db) => {
    const rows = await db.select().from(aiModels).where(eq(aiModels.active, true));
    return rows.some((row) => row.tasks.includes(task));
  });
}

export function listAnalyses(tenantId: string, status?: "draft" | "approved") {
  return withTenant(tenantId, (db) =>
    db.select().from(adAnalyses).where(status ? eq(adAnalyses.status, status) : undefined).orderBy(desc(adAnalyses.periodStart)).limit(5),
  );
}

export function approveAnalysis(tenantId: string, id: string, actor: string) {
  return withTenant(tenantId, (db) => db.update(adAnalyses).set({ status: "approved" }).where(eq(adAnalyses.id, id)), actor);
}
