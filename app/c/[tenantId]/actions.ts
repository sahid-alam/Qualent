"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { draftReply } from "../../../lib/ai/tasks.ts";
import { action, requireLeadAccess, UserError, type Context } from "../../../lib/auth/action.ts";
import { logoDataUrl } from "../../../lib/brand.ts";
import { withTenant } from "../../../lib/db/client.ts";
import { STAGE_KINDS, tenants, type AutomationStep, type Condition, type WorkingHours } from "../../../lib/db/schema.ts";
import { localToUtc } from "../../../lib/time.ts";
import { saveConnection, verifyConnection } from "../../../lib/intake/meta.ts";
import { ingestLead, InvalidLeadError, LeadNotAccessibleError } from "../../../lib/leads/ingest.ts";
import { bulkUpdateLeads, changeStage, completeTask, createNote, createTask, getTask, importCsv, logCall, saveView, setCustomFields } from "../../../lib/leads/work.ts";
import { eraseContact } from "../../../lib/privacy.ts";
import { deliverLead, DeliveryError, NotRoutableError } from "../../../lib/routing.ts";
import {
  addPerson,
  addStage,
  approveAnalysis,
  deleteCustomField,
  deleteRoutingRule,
  deleteStage,
  saveAutomation,
  saveCustomField,
  saveRoutingRule,
  saveStage,
  sendTestEvent,
  sendTestLead,
  setAutomationActive,
  setBrand,
  setIntakeOrigins,
  setPersonActive,
  shiftStage,
  StageError,
  updatePerson,
  updateStage,
  updateTenantSettings,
} from "../../../lib/settings.ts";
import { createLinkCode } from "../../../lib/telegram/updates.ts";
import { ROLES } from "../../../lib/db/schema.ts";

const leadId = z.uuid();
const required = (message: string) => z.string().trim().min(1, message);
const optional = z.string().trim().optional();
const CALL_OUTCOMES = ["reached", "no_answer", "wrong_number", "call_back"] as const;

function ownedBy({ membership }: Context) {
  return membership.recordScope === "assigned" ? (membership.memberId ?? undefined) : undefined;
}

export const addLeadAction = action(
  "leads.write",
  z.object({
    name: optional,
    phone: optional,
    email: optional,
    channel: z.enum(["WhatsApp", "Phone", "Walk-in", "Other"]).default("WhatsApp"),
    campaignId: optional,
    note: optional,
  }),
  async (data, context) => {
    const { actor } = context;
    try {
      const note = [`Came in by ${data.channel}.`, data.note].filter(Boolean).join("\n");
      const { leadId: id, created } = await ingestLead(data.tenantId, {
        source: "manual",
        name: data.name,
        phone: data.phone,
        email: data.email,
        note,
        touch: data.campaignId ? { campaignId: data.campaignId } : undefined,
        actor,
        ownedBy: ownedBy(context),
      });
      return { ok: created ? "Lead added." : "This person already has an open lead, so the note went there.", data: { leadId: id } };
    } catch (error) {
      if (error instanceof InvalidLeadError) throw new UserError("Add a phone number or an email.");
      if (error instanceof LeadNotAccessibleError) throw new UserError("Someone else is already handling this person. Ask your manager.");
      throw error;
    }
  },
);

export const addNoteAction = action("leads.write", z.object({ leadId, body: required("Write a note first.") }), async (data, context) => {
  await requireLeadAccess(data.tenantId, data.leadId, context);
  await createNote(data.tenantId, data.leadId, data.body, context.actor);
  return "Note added.";
});

export const logCallAction = action("leads.write", z.object({ leadId, outcome: z.enum(CALL_OUTCOMES), note: optional }), async (data, context) => {
  await requireLeadAccess(data.tenantId, data.leadId, context);
  await logCall(data.tenantId, data.leadId, data.outcome, data.note || null, context.actor);
  return "Call logged.";
});

export const moveStageAction = action("leads.write", z.object({ leadId, stageId: z.uuid() }), async (data, context) => {
  await requireLeadAccess(data.tenantId, data.leadId, context);
  await changeStage(data.tenantId, data.leadId, data.stageId, context.actor);
  return "Stage updated.";
});

export const deliverAction = action("leads.write", z.object({ leadId, memberId: z.uuid("Choose an agent.") }), async (data, context) => {
  await requireLeadAccess(data.tenantId, data.leadId, context);
  try {
    await deliverLead(data.tenantId, data.leadId, data.memberId, context.actor);
  } catch (error) {
    if (error instanceof DeliveryError) throw new UserError(error.message);
    throw error;
  }
  return "Sent to the client's agent.";
});

export const addTaskAction = action("leads.write", z.object({ leadId, title: required("Name the task."), dueAt: required("Choose a date.") }), async (data, context) => {
  await requireLeadAccess(data.tenantId, data.leadId, context);
  const [tenant] = await withTenant(data.tenantId, (db) => db.select({ timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, data.tenantId)));
  // The form sends a wall-clock time. It means the client's time zone, not the server's.
  const dueAt = localToUtc(data.dueAt, tenant.timezone);
  if (!dueAt) throw new UserError("Choose a valid date.");
  await createTask(data.tenantId, { leadId: data.leadId, title: data.title, dueAt, assigneeMemberId: context.membership.memberId }, context.actor);
  return "Task added.";
});

export const completeTaskAction = action("leads.write", z.object({ taskId: z.uuid() }), async (data, context) => {
  const task = await getTask(data.tenantId, data.taskId);
  if (!task) throw new UserError("This task isn't available to you.");
  await requireLeadAccess(data.tenantId, task.leadId, context);
  await completeTask(data.tenantId, data.taskId, context.actor);
  return "Done.";
});

export const draftReplyAction = action("leads.write", z.object({ leadId }), async (data, context) => {
  await requireLeadAccess(data.tenantId, data.leadId, context);
  const result = await draftReply(data.tenantId, data.leadId);
  if (result.status !== "ok") throw new UserError("A draft isn't available right now.");
  return { ok: "Draft ready. Edit it before you send it.", data: { reply: result.reply } };
});

export const setFieldsAction = action("leads.write", z.object({ leadId }).catchall(z.unknown()), async (data, context) => {
  await requireLeadAccess(data.tenantId, data.leadId, context);
  const values = Object.fromEntries(
    Object.entries(data).filter(([key]) => key !== "tenantId" && key !== "leadId" && !key.startsWith("$")),
  );
  const { errors } = await setCustomFields(data.tenantId, data.leadId, values, context.actor);
  if (errors.length) throw new UserError(errors[0]);
  return "Saved.";
});

export const bulkEditAction = action(
  "leads.write",
  z.object({
    leadIds: z.array(z.uuid()).min(1, "Tick at least one lead."),
    ownerMemberId: z.union([z.literal(""), z.uuid()]).optional(),
    stageId: z.union([z.literal(""), z.uuid()]).optional(),
  }),
  async (data, context) => {
    if (!data.ownerMemberId && !data.stageId) throw new UserError("Choose a person or a stage.");
    for (const id of data.leadIds) await requireLeadAccess(data.tenantId, id, context);
    try {
      await bulkUpdateLeads(data.tenantId, data.leadIds, { ownerMemberId: data.ownerMemberId || undefined, stageId: data.stageId || undefined }, context.actor);
    } catch (error) {
      if (error instanceof NotRoutableError) throw new UserError(error.message);
      throw error;
    }
    return `Updated ${data.leadIds.length} ${data.leadIds.length === 1 ? "lead" : "leads"}.`;
  },
);

export const saveViewAction = action("leads.write", z.object({ name: required("Name the view."), query: z.string() }), async (data, { membership }) => {
  await saveView(data.tenantId, membership.memberId, data.name, { query: data.query });
  return "View saved.";
});

export const importCsvAction = action("leads.write", z.object({ file: z.instanceof(File, { message: "Choose a CSV file." }) }), async (data, context) => {
  if (!data.file.size) throw new UserError("Choose a CSV file.");
  if (data.file.size > 5_000_000) throw new UserError("That file is over 5 MB. Split it and try again.");
  const report = await importCsv(data.tenantId, await data.file.text(), context.actor, ownedBy(context));
  const failed = report.errors.length ? ` ${report.errors.length} failed, first at row ${report.errors[0].row}: ${report.errors[0].message}.` : "";
  return `Created ${report.created}. Duplicates added to existing leads: ${report.duplicates}.${failed}`;
});

export const eraseContactAction = action(
  "contacts.erase",
  z.object({ contactId: z.uuid(), confirm: z.literal("ERASE", "Type ERASE to confirm.") }),
  async (data, { actor }) => {
    await eraseContact(data.tenantId, data.contactId, actor);
    redirect(`/c/${data.tenantId}/leads`);
  },
);

// Client setup

export const addPersonAction = action(
  "settings.manage",
  z.object({ name: required("Enter a name."), role: z.enum(ROLES), email: z.union([z.literal(""), z.email("Enter a valid email address.")]).optional(), weight: z.coerce.number().int().min(1).max(10).default(1), recordScope: z.enum(["all", "assigned"]).default("all") }),
  async (data, { actor }) => {
    if (data.role !== "field_agent" && !data.email) throw new UserError("Staff and clients need an email to sign in.");
    if (!(await addPerson(data.tenantId, data, actor))) throw new UserError("Someone with this email is already waiting to sign in.");
    return `${data.name} added.`;
  },
);

export const setPersonActiveAction = action("settings.manage", z.object({ memberId: z.uuid(), active: z.enum(["true", "false"]) }), async (data, { actor }) => {
  await setPersonActive(data.tenantId, data.memberId, data.active === "true", actor);
  return "Saved.";
});

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Reads the day rows. Null means always on duty. */
function readHours(data: Record<string, unknown>): WorkingHours | null {
  if (data.schedule !== "set") return null;
  const hours: WorkingHours = {};
  for (const day of DAYS) {
    if (data[`on${day}`] !== "on") continue;
    const from = String(data[`from${day}`] ?? "");
    const to = String(data[`to${day}`] ?? "");
    if (!CLOCK.test(from) || !CLOCK.test(to) || from >= to) throw new UserError("Each working day needs a start time before its end time.");
    hours[day] = { from, to };
  }
  return hours;
}

export const updatePersonAction = action(
  "settings.manage",
  z.looseObject({
    memberId: z.uuid(),
    weight: z.coerce.number().int().min(1, "Weight starts at 1.").max(10, "Weight stops at 10."),
    recordScope: z.enum(["all", "assigned"]).default("all"),
    schedule: z.enum(["always", "set"]).default("always"),
  }),
  async (data, { actor }) => {
    await updatePerson(data.tenantId, data.memberId, { weight: data.weight, recordScope: data.recordScope, workingHours: readHours(data) }, actor);
    return "Saved.";
  },
);

export const linkTelegramAction = action("settings.manage", z.object({ memberId: z.string().optional() }), async (data) => {
  const memberId = data.memberId ? z.uuid().parse(data.memberId) : null;
  const { url, code } = await createLinkCode(data.tenantId, memberId);
  return { ok: "Link ready. It works once and expires in 15 minutes.", data: { url, code } };
});

export const saveConnectionAction = action(
  "connections.manage",
  z.object({ kind: z.enum(["page", "ad_account", "dataset"]), externalId: required("Enter the ID from Meta."), name: optional, secret: optional, testEventCode: optional }),
  async (data, { actor }) => {
    const externalId = data.kind === "ad_account" && !data.externalId.startsWith("act_") ? `act_${data.externalId}` : data.externalId;
    const id = await saveConnection(data.tenantId, { ...data, externalId, secret: data.secret || undefined, testEventCode: data.testEventCode || undefined }, actor);
    const problem = await verifyConnection(data.tenantId, id);
    if (problem) throw new UserError(`Saved, but Meta refused it, so nothing will arrive yet. ${problem}`);
    return "Connected.";
  },
);

export const addRuleAction = action(
  "settings.manage",
  z.object({
    memberIds: z.array(z.uuid()).min(1, "Choose at least one person."),
    slaMinutes: z.coerce.number().int().min(1).max(1440),
    maxReassigns: z.coerce.number().int().min(0).max(10),
    escalateToMemberId: z.union([z.literal(""), z.uuid()]).optional(),
    campaignId: optional,
  }),
  async (data, { actor }) => {
    await saveRoutingRule(
      data.tenantId,
      {
        memberIds: data.memberIds,
        slaMinutes: data.slaMinutes,
        maxReassigns: data.maxReassigns,
        escalateToMemberId: data.escalateToMemberId || null,
        conditions: data.campaignId ? [{ field: "touch.campaignId", op: "eq", value: data.campaignId }] : [],
      },
      actor,
    );
    return "Rule added.";
  },
);

export const deleteRuleAction = action("settings.manage", z.object({ ruleId: z.uuid() }), async (data, { actor }) => {
  await deleteRoutingRule(data.tenantId, data.ruleId, actor);
  return "Rule removed.";
});

export const testLeadAction = action("settings.manage", z.object({}), async (data, { actor }) => {
  const report = await sendTestLead(data.tenantId, actor);
  return { ok: "Test finished.", data: report };
});

export const brandAction = action(
  "settings.manage",
  z.object({ name: optional, color: optional, logo: z.instanceof(File).optional() }),
  async (data, { actor }) => {
    let logo: string | undefined;
    if (data.logo?.size) {
      try {
        logo = logoDataUrl(new Uint8Array(await data.logo.arrayBuffer()));
      } catch (error) {
        throw new UserError((error as Error).message);
      }
    }
    if (data.color && !/^#[0-9a-f]{6}$/i.test(data.color)) throw new UserError("Choose a valid color.");
    const brand = await setBrand(data.tenantId, { name: data.name || undefined, color: data.color, logo }, actor);
    return brand.adjusted ? "Saved. We adjusted the color so labels stay readable." : "Saved.";
  },
);

export const originsAction = action("settings.manage", z.object({ origins: z.string().default("") }), async (data, { actor }) => {
  const origins = data.origins
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        throw new UserError(`${value} isn't a full web address. Start it with https://.`);
      }
    });
  await setIntakeOrigins(data.tenantId, origins, actor);
  return "Saved.";
});

const stageChange = (run: () => Promise<unknown>, done: string) =>
  run().then(
    () => done,
    (error) => {
      if (error instanceof StageError) throw new UserError(error.message);
      throw error;
    },
  );

const stageFields = { name: required("Name the stage."), kind: z.enum(STAGE_KINDS) };

export const saveStageAction = action("settings.manage", z.object({ stageId: z.uuid(), ...stageFields }), (data, { actor }) =>
  stageChange(() => saveStage(data.tenantId, data.stageId, { name: data.name, kind: data.kind }, actor), "Saved."),
);

export const addStageAction = action("settings.manage", z.object(stageFields), async (data, { actor }) => {
  await addStage(data.tenantId, { name: data.name, kind: data.kind }, actor);
  return `${data.name} added at the end.`;
});

export const shiftStageAction = action("settings.manage", z.object({ stageId: z.uuid(), direction: z.enum(["up", "down"]) }), (data, { actor }) =>
  stageChange(() => shiftStage(data.tenantId, data.stageId, data.direction, actor), "Moved."),
);

export const deleteStageAction = action("settings.manage", z.object({ stageId: z.uuid() }), (data, { actor }) =>
  stageChange(() => deleteStage(data.tenantId, data.stageId, actor), "Removed."),
);

const RESERVED_FIELDS = ["meta_answers", "tags", "test"];

export const addFieldAction = action(
  "settings.manage",
  z.object({
    label: required("Name the field."),
    type: z.enum(["text", "number", "date", "select", "boolean"]),
    options: z.string().default(""),
    required: z.enum(["on"]).optional(),
  }),
  async (data, { actor }) => {
    const key = data.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!key || RESERVED_FIELDS.includes(key)) throw new UserError("Choose a different name for this field.");
    const options = data.options.split(",").map((option) => option.trim()).filter(Boolean);
    if (data.type === "select" && !options.length) throw new UserError("List the choices, separated by commas.");
    const added = await saveCustomField(data.tenantId, { key, label: data.label, type: data.type, options: data.type === "select" ? options : null, required: !!data.required }, actor);
    if (!added) throw new UserError("A field with this name already exists.");
    return `${data.label} added.`;
  },
);

export const deleteFieldAction = action("settings.manage", z.object({ fieldId: z.uuid() }), async (data, { actor }) => {
  await deleteCustomField(data.tenantId, data.fieldId, actor);
  return "Removed.";
});

const validZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

export const clientSettingsAction = action(
  "settings.manage",
  z.object({
    timezone: z.string().trim().refine(validZone, "Use a time zone like Asia/Dubai."),
    currency: z.string().trim().toUpperCase().length(3, "Use a three-letter currency code, like AED."),
    retentionDays: z.coerce.number().int().min(30, "Keep leads for at least 30 days.").max(3650, "Ten years is the longest."),
    aiMonthlyBudgetUsd: z.coerce.number().min(0, "The budget can't be negative.").max(10_000, "Keep the budget under $10,000."),
  }),
  async (data, { actor }) => {
    await updateTenantSettings(data.tenantId, { timezone: data.timezone, currency: data.currency, retentionDays: data.retentionDays, aiMonthlyBudgetUsd: data.aiMonthlyBudgetUsd.toFixed(2) }, actor);
    return "Saved.";
  },
);

// Meta results

export const updateStageAction = action(
  "settings.manage",
  z.object({ stageId: z.uuid(), capiEnabled: z.enum(["on"]).optional(), agentButton: z.enum(["on"]).optional(), capiEventName: required("Name the Meta event.") }),
  async (data, { actor }) => {
    await updateStage(data.tenantId, data.stageId, { capiEnabled: !!data.capiEnabled, agentButton: !!data.agentButton, capiEventName: data.capiEventName }, actor);
    return "Saved.";
  },
);

export const testEventAction = action("connections.manage", z.object({ code: required("Paste the test code from Meta.") }), async (data) => {
  const result = await sendTestEvent(data.tenantId, data.code);
  if (!result.ok) throw new UserError(result.message);
  return result.message;
});

// Reports and automations

export const approveAnalysisAction = action("reports.team", z.object({ analysisId: z.uuid() }), async (data, { actor }) => {
  await approveAnalysis(data.tenantId, data.analysisId, actor);
  return "Approved. The client can see it now.";
});

const TRIGGERS = ["lead_created", "stage_changed", "score_changed", "task_overdue", "no_activity"] as const;

export const saveAutomationAction = action(
  "settings.manage",
  z.object({
    name: required("Name the rule."),
    trigger: z.enum(TRIGGERS),
    triggerStageId: z.string().optional(),
    days: z.union([z.literal(""), z.coerce.number().int().min(1).max(365)]).optional(),
    temperature: z.enum(["", "hot", "warm", "cold"]).optional(),
    assignMemberId: z.union([z.literal(""), z.uuid()]).optional(),
    tag: optional,
    waitMinutes: z.coerce.number().int().min(0).max(43_200).default(0),
    taskTitle: optional,
    alertText: optional,
    moveStageId: z.string().optional(),
    exitStageIds: z.array(z.uuid()).default([]),
  }),
  async (data, { actor }) => {
    const steps: AutomationStep[] = [
      ...(data.waitMinutes ? [{ type: "wait" as const, minutes: data.waitMinutes }] : []),
      ...(data.taskTitle ? [{ type: "create_task" as const, title: data.taskTitle }] : []),
      ...(data.alertText ? [{ type: "alert" as const, text: data.alertText }] : []),
      ...(data.moveStageId ? [{ type: "move_stage" as const, stageId: z.uuid().parse(data.moveStageId) }] : []),
      ...(data.assignMemberId ? [{ type: "assign" as const, memberId: data.assignMemberId }] : []),
      ...(data.tag ? [{ type: "tag" as const, tag: data.tag }] : []),
    ];
    const conditions: Condition[] = data.temperature ? [{ field: "temperature", op: "eq", value: data.temperature }] : [];
    if (!steps.some((step) => step.type !== "wait")) throw new UserError("Add at least one thing for the rule to do.");
    await saveAutomation(
      data.tenantId,
      {
        name: data.name,
        trigger: data.trigger,
        triggerConfig: { stageId: data.trigger === "stage_changed" ? data.triggerStageId || undefined : undefined, days: data.trigger === "no_activity" ? data.days || 3 : undefined },
        conditions,
        steps,
        exitStageIds: data.exitStageIds,
      },
      actor,
    );
    return "Rule turned on.";
  },
);

export const setAutomationActiveAction = action("settings.manage", z.object({ ruleId: z.uuid(), active: z.enum(["true", "false"]) }), async (data, { actor }) => {
  await setAutomationActive(data.tenantId, data.ruleId, data.active === "true", actor);
  return "Saved.";
});
