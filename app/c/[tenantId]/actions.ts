"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { draftReply } from "../../../lib/ai/tasks.ts";
import { action, requireLeadAccess, UserError } from "../../../lib/auth/action.ts";
import { logoDataUrl } from "../../../lib/brand.ts";
import { withTenant } from "../../../lib/db/client.ts";
import { tenants, type AutomationStep } from "../../../lib/db/schema.ts";
import { localToUtc } from "../../../lib/time.ts";
import { saveConnection } from "../../../lib/intake/meta.ts";
import { ingestLead, InvalidLeadError } from "../../../lib/leads/ingest.ts";
import { bulkUpdateLeads, changeStage, completeTask, createNote, createTask, getTask, importCsv, logCall, saveView, setCustomFields } from "../../../lib/leads/work.ts";
import { eraseContact } from "../../../lib/privacy.ts";
import { deliverLead } from "../../../lib/routing.ts";
import {
  addPerson,
  approveAnalysis,
  deleteRoutingRule,
  saveAutomation,
  saveRoutingRule,
  sendTestEvent,
  sendTestLead,
  setAutomationActive,
  setBrand,
  setIntakeOrigins,
  setPersonActive,
  updateStage,
} from "../../../lib/settings.ts";
import { createLinkCode } from "../../../lib/telegram/updates.ts";
import { ROLES } from "../../../lib/db/schema.ts";

const leadId = z.uuid();
const required = (message: string) => z.string().trim().min(1, message);
const optional = z.string().trim().optional();
const CALL_OUTCOMES = ["reached", "no_answer", "wrong_number", "call_back"] as const;

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
  async (data, { actor }) => {
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
      });
      return { ok: created ? "Lead added." : "This person already has an open lead, so the note went there.", data: { leadId: id } };
    } catch (error) {
      if (error instanceof InvalidLeadError) throw new UserError("Add a phone number or an email.");
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
    throw new UserError((error as Error).message);
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

export const bulkAssignAction = action("leads.write", z.object({ leadIds: z.array(z.uuid()).min(1, "Tick at least one lead."), ownerMemberId: z.uuid("Choose a person.") }), async (data, context) => {
  for (const id of data.leadIds) await requireLeadAccess(data.tenantId, id, context);
  await bulkUpdateLeads(data.tenantId, data.leadIds, { ownerMemberId: data.ownerMemberId }, context.actor);
  return `Assigned ${data.leadIds.length} ${data.leadIds.length === 1 ? "lead" : "leads"}.`;
});

export const saveViewAction = action("leads.write", z.object({ name: required("Name the view."), query: z.string() }), async (data, { membership }) => {
  await saveView(data.tenantId, membership.memberId, data.name, { query: data.query });
  return "View saved.";
});

export const importCsvAction = action("leads.write", z.object({ file: z.instanceof(File, { message: "Choose a CSV file." }) }), async (data, { actor }) => {
  if (!data.file.size) throw new UserError("Choose a CSV file.");
  if (data.file.size > 5_000_000) throw new UserError("That file is over 5 MB. Split it and try again.");
  const report = await importCsv(data.tenantId, await data.file.text(), actor);
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
    await addPerson(data.tenantId, data, actor);
    return `${data.name} added.`;
  },
);

export const setPersonActiveAction = action("settings.manage", z.object({ memberId: z.uuid(), active: z.enum(["true", "false"]) }), async (data, { actor }) => {
  await setPersonActive(data.tenantId, data.memberId, data.active === "true", actor);
  return "Saved.";
});

export const linkTelegramAction = action("settings.manage", z.object({ memberId: z.string().optional() }), async (data) => {
  const memberId = data.memberId ? z.uuid().parse(data.memberId) : null;
  const { url, code } = await createLinkCode(data.tenantId, memberId);
  return { ok: "Link ready. It works once and expires in 15 minutes.", data: { url, code } };
});

export const saveConnectionAction = action(
  "connections.manage",
  z.object({ kind: z.enum(["page", "ad_account", "dataset"]), externalId: required("Enter the ID from Meta."), name: optional, secret: optional, testEventCode: optional }),
  async (data, { actor }) => {
    await saveConnection(data.tenantId, { ...data, secret: data.secret || undefined, testEventCode: data.testEventCode || undefined }, actor);
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
    days: z.coerce.number().int().min(1).max(365).optional(),
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
    ];
    if (!steps.some((step) => step.type !== "wait")) throw new UserError("Add at least one thing for the rule to do.");
    await saveAutomation(
      data.tenantId,
      {
        name: data.name,
        trigger: data.trigger,
        triggerConfig: { stageId: data.triggerStageId || undefined, days: data.days },
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
