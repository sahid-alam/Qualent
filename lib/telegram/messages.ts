import { and, asc, eq } from "drizzle-orm";
import { withTenant, type Db } from "../db/client.ts";
import { activities, contacts, leads, members, stages, tenants } from "../db/schema.ts";
import { enqueue, type JobData } from "../jobs/queues.ts";
import { maskPhone } from "../phone.ts";
import { encodeCallback } from "./updates.ts";
import { telegramConfigured, tg, TelegramError } from "./api.ts";

const REASONS: Record<string, string> = {
  new_lead: "New lead",
  new_unassigned: "New lead, unassigned",
  out_of_hours: "New lead, nobody on duty",
  no_reply_reassigned: "No reply, reassigned",
  no_reply_escalated: "No reply, escalated",
  agent_no_reply: "Client agent has not replied",
  hot_lead: "Hot lead",
  delivery_failed: "Could not deliver to client agent",
};

const leadUrl = (tenantId: string, leadId: string) => `${process.env.APP_URL ?? ""}/c/${tenantId}/leads/${leadId}`;

function leadWithContact(db: Db, leadId: string) {
  return db
    .select({ lead: leads, contact: contacts })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(eq(leads.id, leadId))
    .then(([row]) => row);
}

/** Group alerts stay masked. Only the private delivery carries the full phone. */
function teamAlertText(reason: string, row: Awaited<ReturnType<typeof leadWithContact>>) {
  return [
    REASONS[reason] ?? reason,
    `${row.contact.name ?? "Unknown"}, ${maskPhone(row.contact.phoneE164)}`,
    row.lead.temperature ? `AI: ${row.lead.temperature}` : null,
    leadUrl(row.lead.tenantId, row.lead.id),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function handleTelegramJob(data: JobData) {
  const tenantId = data.tenantId!;
  if (!telegramConfigured()) {
    console.warn(`telegram not configured, skipped ${data.type}`);
    return;
  }
  try {
    if (data.type === "delivery") await sendDelivery(tenantId, data.leadId as string, data.memberId as string);
    else await sendToTeam(tenantId, data);
  } catch (error) {
    if (!(error instanceof TelegramError)) throw error;
    if (error.retryAfter) {
      // Honor Telegram's wait exactly, instead of the queue's own backoff.
      await withTenant(tenantId, (db) => enqueue(db, "telegram", data, { startAfter: error.retryAfter }));
      return;
    }
    if (!error.permanent) throw error;
    if (data.type === "delivery") await markDeliveryFailed(tenantId, data.leadId as string, error.message);
    else console.error(`telegram team alert failed: ${error.message}`);
  }
}

async function sendToTeam(tenantId: string, data: JobData) {
  const { chatId, text } = await withTenant(tenantId, async (db) => {
    const [tenant] = await db.select({ chatId: tenants.telegramTeamChatId }).from(tenants).where(eq(tenants.id, tenantId));
    const body = data.text
      ? String(data.text)
      : teamAlertText(data.reason as string, await leadWithContact(db, data.leadId as string));
    return { chatId: tenant.chatId, text: body };
  });
  if (chatId) await tg("sendMessage", { chat_id: chatId, text });
}

async function sendDelivery(tenantId: string, leadId: string, memberId: string) {
  const message = await withTenant(tenantId, async (db) => {
    const row = await leadWithContact(db, leadId);
    const [agent] = await db.select().from(members).where(eq(members.id, memberId));
    const buttons = await db
      .select()
      .from(stages)
      .where(and(eq(stages.pipelineId, row.lead.pipelineId), eq(stages.agentButton, true)))
      .orderBy(asc(stages.position));
    const [lastNote] = await db
      .select({ body: activities.body })
      .from(activities)
      .where(and(eq(activities.leadId, leadId), eq(activities.kind, "note")))
      .orderBy(asc(activities.occurredAt))
      .limit(1);
    return {
      chat_id: agent.telegramChatId,
      text: [
        `New lead: ${row.contact.name ?? "Unknown"}`,
        `Phone: ${row.contact.phoneE164 ?? row.contact.phoneRaw ?? "none"}`,
        row.contact.email ? `Email: ${row.contact.email}` : null,
        lastNote?.body ? `Asked: ${lastNote.body}` : null,
        row.lead.summary ? `Summary: ${row.lead.summary}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      reply_markup: {
        inline_keyboard: [
          buttons.map((stage) => ({ text: stage.name, callback_data: encodeCallback(tenantId, leadId, stage.position) })),
        ],
      },
    };
  });
  await tg("sendMessage", message);
}

async function markDeliveryFailed(tenantId: string, leadId: string, reason: string) {
  await withTenant(tenantId, async (db) => {
    await db.update(leads).set({ deliveryFailedAt: new Date() }).where(eq(leads.id, leadId));
    await db.insert(activities).values({ tenantId, leadId, kind: "delivery", body: `Delivery failed: ${reason}` });
    await enqueue(db, "telegram", { type: "team_alert", tenantId, leadId, reason: "delivery_failed" });
  });
}
