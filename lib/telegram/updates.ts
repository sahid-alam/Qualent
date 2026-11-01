import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { withPlatform, withTenant } from "../db/client.ts";
import { leads, members, stages, tenantDirectory, tenants, webhookInbox } from "../db/schema.ts";
import { enqueue } from "../jobs/queues.ts";
import { moveStage } from "../leads/stage.ts";
import { tg } from "./api.ts";

const LINK_MINUTES = 15;

const compact = (uuid: string) => Buffer.from(uuid.replaceAll("-", ""), "hex").toString("base64url");

function expand(value: string) {
  const hex = Buffer.from(value, "base64url").toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const STAGE_PREFIX = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Fits Telegram's 64-byte callback limit: two compact ids and the start of the
 * stage id. Not its position, because reordering stages must not change what an
 * old button does.
 */
export function encodeCallback(tenantId: string, leadId: string, stageId: string) {
  return `s:${compact(tenantId)}:${compact(leadId)}:${stageId.replaceAll("-", "").slice(0, STAGE_PREFIX)}`;
}

export function decodeCallback(data: string) {
  const [prefix, tenant, lead, stage] = data.split(":");
  if (prefix !== "s" || !tenant || !lead || !/^[0-9a-f]{12}$/.test(stage ?? "")) return null;
  const ids = { tenantId: expand(tenant), leadId: expand(lead) };
  // Telegram lets clients send any callback data, and a bad id must not become a failing job.
  if (!UUID.test(ids.tenantId) || !UUID.test(ids.leadId)) return null;
  return { ...ids, stagePrefix: stage };
}

/** Null member links the tenant's team group. */
export async function createLinkCode(tenantId: string, memberId: string | null) {
  const code = randomBytes(16).toString("base64url");
  await withTenant(tenantId, (db) =>
    db.insert(tenantDirectory).values({
      key: `link:${code}`,
      kind: "link_code",
      tenantId,
      memberId,
      expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000),
    }),
  );
  // startgroup asks which group to add the bot to. A plain start link would link a private chat.
  return { code, url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME ?? "bot"}?${memberId ? "start" : "startgroup"}=${code}` };
}

export function verifyTelegramSecret(header: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !header || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function saveTelegramUpdate(update: { update_id: number }) {
  return withPlatform(async (db) => {
    const [row] = await db
      .insert(webhookInbox)
      .values({ source: "telegram", externalId: String(update.update_id), payload: update })
      .onConflictDoNothing()
      .returning({ id: webhookInbox.id });
    if (row) await enqueue(db, "intake", { type: "telegram_update", inboxId: row.id });
  });
}

type Update = {
  message?: { text?: string; chat: { id: number; type: string }; from?: { id: number } };
  callback_query?: { id: string; data?: string; from: { id: number } };
};

export async function processTelegramUpdate(update: Update) {
  if (update.callback_query) return handleButton(update.callback_query);
  const text = update.message?.text ?? "";
  const match = text.match(/^\/start(?:@\w+)?\s+(\S+)/);
  if (match && update.message) return handleLink(match[1], update.message);
}

async function handleLink(code: string, message: NonNullable<Update["message"]>) {
  const chatId = String(message.chat.id);
  const where = and(eq(tenantDirectory.key, `link:${code}`), eq(tenantDirectory.kind, "link_code"));
  const [peek] = await withPlatform((db) => db.select().from(tenantDirectory).where(where));
  // Team alerts carry lead names, so they must never land in one person's chat. The link stays usable.
  if (peek && !peek.memberId && message.chat.type === "private") {
    await tg("sendMessage", { chat_id: chatId, text: "This link is for a group. Open it again and choose the team group." });
    return;
  }
  // Deliveries carry a full phone number, so they must never land in a group.
  if (peek?.memberId && message.chat.type !== "private") {
    await tg("sendMessage", { chat_id: chatId, text: "This link is personal. Open it in a private chat with the bot." });
    return;
  }
  const [entry] = await withPlatform((db) => db.delete(tenantDirectory).where(where).returning());
  if (!entry || !entry.expiresAt || entry.expiresAt < new Date()) {
    await tg("sendMessage", { chat_id: chatId, text: "This link has expired. Ask for a new one." });
    return;
  }
  await withTenant(entry.tenantId, async (db) => {
    if (entry.memberId) {
      await db
        .update(members)
        .set({ telegramChatId: chatId, telegramUserId: String(message.from?.id ?? message.chat.id) })
        .where(eq(members.id, entry.memberId));
    } else {
      await db.update(tenants).set({ telegramTeamChatId: chatId }).where(eq(tenants.id, entry.tenantId));
    }
  });
  await tg("sendMessage", { chat_id: chatId, text: "Linked. You will get leads here." });
}

async function handleButton(query: NonNullable<Update["callback_query"]>) {
  const decoded = decodeCallback(query.data ?? "");
  const answer = (text: string) => tg("answerCallbackQuery", { callback_query_id: query.id, text });
  if (!decoded) return answer("Unknown button");

  const { tenantId, leadId, stagePrefix } = decoded;
  const result = await withTenant(tenantId, async (db) => {
    const [member] = await db.select().from(members).where(and(eq(members.telegramUserId, String(query.from.id)), eq(members.active, true)));
    if (!member) return "You are not linked to this client.";

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).for("update");
    if (!lead || lead.deliveredToMemberId !== member.id) return "This lead is not assigned to you.";

    const stage = (await db.select().from(stages).where(and(eq(stages.pipelineId, lead.pipelineId), eq(stages.agentButton, true)))).find(
      (candidate) => candidate.id.replaceAll("-", "").startsWith(stagePrefix),
    );
    if (!stage) return "That option is no longer available.";

    await db
      .update(leads)
      .set({
        agentResponseAt: sql`coalesce(${leads.agentResponseAt}, now())`,
        firstResponseAt: sql`coalesce(${leads.firstResponseAt}, now())`,
      })
      .where(eq(leads.id, leadId));
    const moved = await moveStage(db, tenantId, leadId, stage.id, `telegram:${member.id}`);
    return moved ? `Updated: ${stage.name}` : `Already at ${stage.name}`;
  }, `telegram:${query.from.id}`);
  await answer(result);
}
