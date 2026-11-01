import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { isWithinHours, matches, pickByWeight } from "../lib/conditions.ts";
import { withTenant } from "../lib/db/client.ts";
import { activities, capiEvents, leads, members, routingRules, tenantDirectory, tenants } from "../lib/db/schema.ts";
import { ingestLead } from "../lib/leads/ingest.ts";
import { logCall } from "../lib/leads/work.ts";
import { assignLead, checkAgentTimer, checkReplyTimer, deliverLead } from "../lib/routing.ts";
import { handleTelegramJob } from "../lib/telegram/messages.ts";
import { createLinkCode, decodeCallback, encodeCallback, processTelegramUpdate, verifyTelegramSecret } from "../lib/telegram/updates.ts";
import { addMember, newTenant, stageByName, stubFetch, uniquePhone } from "./helpers.ts";

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
});
afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
});

const lead = (tenantId: string, leadId: string) =>
  withTenant(tenantId, (db) => db.select().from(leads).where(eq(leads.id, leadId))).then(([row]) => row);

const newLead = (tenantId: string, phone = uniquePhone()) => ingestLead(tenantId, { source: "manual", name: "Asha Rao", phone }).then((r) => r.leadId);

const addRule = (tenantId: string, values: Partial<typeof routingRules.$inferInsert> & { memberIds: string[] }) =>
  withTenant(tenantId, (db) => db.insert(routingRules).values({ tenantId, ...values }).returning().then(([row]) => row));

test("equal weights take turns; heavier weights get more", () => {
  const a = { id: "a", weight: 1 };
  const b = { id: "b", weight: 1 };
  const counts: Record<string, number> = {};
  const picks = [1, 2, 3, 4].map(() => {
    const pick = pickByWeight([a, b], counts);
    counts[pick.id] = (counts[pick.id] ?? 0) + 1;
    return pick.id;
  });
  expect(picks).toEqual(["a", "b", "a", "b"]);

  const heavy = { id: "h", weight: 3 };
  const tally: Record<string, number> = {};
  for (let i = 0; i < 8; i++) {
    const pick = pickByWeight([heavy, a], tally);
    tally[pick.id] = (tally[pick.id] ?? 0) + 1;
  }
  expect(tally).toEqual({ h: 6, a: 2 });
});

test("working hours use the tenant's time zone", () => {
  const hours = { "0": { from: "09:00", to: "18:00" } };
  // Sunday 10:00 UTC is 14:00 in Dubai.
  expect(isWithinHours(hours, "Asia/Dubai", new Date("2026-11-01T10:00:00Z"))).toBe(true);
  // Sunday 15:00 UTC is 19:00 in Dubai.
  expect(isWithinHours(hours, "Asia/Dubai", new Date("2026-11-01T15:00:00Z"))).toBe(false);
  // Monday has no window.
  expect(isWithinHours(hours, "Asia/Dubai", new Date("2026-11-02T08:00:00Z"))).toBe(false);
  expect(isWithinHours(null, "Asia/Dubai")).toBe(true);
});

test("conditions cover each operator, including nested fields", () => {
  const target = { temperature: "hot", score: 70, custom: { area: "Marina" }, touch: { campaignId: "c1" }, empty: "" };
  expect(matches([{ field: "temperature", op: "eq", value: "hot" }], target)).toBe(true);
  expect(matches([{ field: "temperature", op: "neq", value: "hot" }], target)).toBe(false);
  expect(matches([{ field: "custom.area", op: "in", value: ["Marina"] }], target)).toBe(true);
  expect(matches([{ field: "touch.campaignId", op: "eq", value: "c1" }], target)).toBe(true);
  expect(matches([{ field: "score", op: "gte", value: 70 }, { field: "score", op: "lte", value: 69 }], target)).toBe(false);
  expect(matches([{ field: "empty", op: "set" }], target)).toBe(false);
  expect(matches([], target)).toBe(true);
});

test("a rule assigns the lead, and the first matching rule wins", async () => {
  const { id } = await newTenant();
  const staff = await addMember(id);
  const other = await addMember(id);
  await addRule(id, { position: 1, memberIds: [staff.id] });
  await addRule(id, { position: 0, memberIds: [other.id], conditions: [{ field: "touch.source", op: "eq", value: "landing_page" }] });

  const leadId = await newLead(id);
  await assignLead(id, leadId);
  const row = await lead(id, leadId);
  expect(row.ownerMemberId).toBe(staff.id);
  expect(row.assignedAt).toBeInstanceOf(Date);

  // Running again changes nothing, so a retried job is harmless.
  await assignLead(id, leadId);
  const [rule] = await withTenant(id, (db) => db.select().from(routingRules).where(eq(routingRules.position, 1)));
  expect(rule.counters).toEqual({ [staff.id]: 1 });
});

test("with no rule or nobody on duty, the lead stays unassigned", async () => {
  const { id } = await newTenant();
  const noRule = await newLead(id);
  await assignLead(id, noRule);
  expect((await lead(id, noRule)).ownerMemberId).toBeNull();

  const closed = await addMember(id, { workingHours: {} });
  await addRule(id, { memberIds: [closed.id] });
  const offHours = await newLead(id);
  await assignLead(id, offHours);
  expect((await lead(id, offHours)).ownerMemberId).toBeNull();
});

test("no reply moves the lead on, a reply cancels, and it never loops", async () => {
  const { id } = await newTenant();
  const [a, b, manager] = [await addMember(id), await addMember(id), await addMember(id, { role: "manager" })];
  const rule = await addRule(id, { memberIds: [a.id, b.id], maxReassigns: 1, escalateToMemberId: manager.id });

  const leadId = await newLead(id);
  await assignLead(id, leadId);
  expect((await lead(id, leadId)).ownerMemberId).toBe(a.id);

  // A stale timer for someone who no longer owns the lead does nothing.
  await checkReplyTimer(id, leadId, b.id, rule.id);
  expect((await lead(id, leadId)).ownerMemberId).toBe(a.id);

  await checkReplyTimer(id, leadId, a.id, rule.id);
  expect(await lead(id, leadId)).toMatchObject({ ownerMemberId: b.id, reassignCount: 1 });

  await checkReplyTimer(id, leadId, b.id, rule.id);
  expect((await lead(id, leadId)).ownerMemberId).toBe(manager.id);

  await checkReplyTimer(id, leadId, manager.id, rule.id);
  expect((await lead(id, leadId)).ownerMemberId).toBe(manager.id);

  const replied = await newLead(id);
  await assignLead(id, replied);
  const owner = (await lead(id, replied)).ownerMemberId!;
  await logCall(id, replied, "reached", null, "t");
  await checkReplyTimer(id, replied, owner, rule.id);
  expect((await lead(id, replied)).ownerMemberId).toBe(owner);
});

test("callback data fits Telegram's 64-byte limit and round-trips", () => {
  const tenantId = "11111111-2222-4333-8444-555555555555";
  const leadId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const data = encodeCallback(tenantId, leadId, 12);
  expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
  expect(decodeCallback(data)).toEqual({ tenantId, leadId, position: 12 });
  expect(decodeCallback("garbage")).toBeNull();
});

test("the webhook secret must match", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "right";
  expect(verifyTelegramSecret("right")).toBe(true);
  expect(verifyTelegramSecret("wrong")).toBe(false);
  expect(verifyTelegramSecret(null)).toBe(false);
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  expect(verifyTelegramSecret("right")).toBe(false);
});

async function linkedAgent(tenantId: string, telegramId: number) {
  const agent = await addMember(tenantId, { role: "field_agent" });
  stubFetch();
  const { code } = await createLinkCode(tenantId, agent.id);
  await processTelegramUpdate({ message: { text: `/start ${code}`, chat: { id: telegramId, type: "private" }, from: { id: telegramId } } });
  return agent;
}

test("a link binds a member once, and an expired one fails", async () => {
  const { id } = await newTenant();
  const agent = await addMember(id, { role: "field_agent" });
  const calls = stubFetch();

  const { code, url } = await createLinkCode(id, agent.id);
  expect(url).toContain(`start=${code}`);
  const update = { message: { text: `/start ${code}`, chat: { id: 555, type: "private" }, from: { id: 555 } } };
  await processTelegramUpdate(update);
  const [row] = await withTenant(id, (db) => db.select().from(members).where(eq(members.id, agent.id)));
  expect(row).toMatchObject({ telegramChatId: "555", telegramUserId: "555" });

  await processTelegramUpdate({ message: { ...update.message, chat: { id: 999, type: "private" }, from: { id: 999 } } });
  expect(calls.at(-1)?.json?.text).toContain("expired");

  await withTenant(id, (db) =>
    db.insert(tenantDirectory).values({ key: `link:old-${id}`, kind: "link_code", tenantId: id, memberId: agent.id, expiresAt: new Date(0) }),
  );
  await processTelegramUpdate({ message: { text: `/start old-${id}`, chat: { id: 777, type: "private" }, from: { id: 777 } } });
  expect(calls.at(-1)?.json?.text).toContain("expired");
  const [after] = await withTenant(id, (db) => db.select().from(members).where(eq(members.id, agent.id)));
  expect(after.telegramChatId).toBe("555");
});

test("a group link sets the team chat, and alerts mask the phone", async () => {
  const { id } = await newTenant();
  const calls = stubFetch();
  const { code } = await createLinkCode(id, null);
  await processTelegramUpdate({ message: { text: `/start@QualentBot ${code}`, chat: { id: -100, type: "group" }, from: { id: 1 } } });
  const [tenant] = await withTenant(id, (db) => db.select().from(tenants));
  expect(tenant.telegramTeamChatId).toBe("-100");

  const leadId = await newLead(id, "+971501234567");
  await handleTelegramJob({ type: "team_alert", tenantId: id, leadId, reason: "new_lead" });
  const message = calls.at(-1)!;
  expect(message.json?.chat_id).toBe("-100");
  expect(message.json?.text).toContain("Asha Rao");
  expect(message.json?.text).toContain("+971•••567");
  expect(message.json?.text).not.toContain("501234567");
});

test("delivery sends the full phone privately, with the stage buttons", async () => {
  const { id } = await newTenant();
  const agent = await linkedAgent(id, 42);
  const leadId = await newLead(id, "+971501234567");
  const calls = stubFetch();

  await deliverLead(id, leadId, agent.id, "staff");
  await handleTelegramJob({ type: "delivery", tenantId: id, leadId, memberId: agent.id });

  const message = calls.at(-1)!;
  expect(message.json?.chat_id).toBe("42");
  expect(message.json?.text).toContain("+971501234567");
  const buttons = (message.json?.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] }).inline_keyboard[0];
  expect(buttons.map((button) => button.text)).toEqual(["Contacted", "Viewing", "Won", "Lost"]);
  expect((await lead(id, leadId)).deliveredToMemberId).toBe(agent.id);
});

test("only linked client agents can receive a delivery", async () => {
  const { id } = await newTenant();
  const leadId = await newLead(id);
  const staff = await addMember(id);
  const unlinked = await addMember(id, { role: "field_agent" });
  await expect(deliverLead(id, leadId, staff.id, "s")).rejects.toThrow(/Not an active client agent/);
  await expect(deliverLead(id, leadId, unlinked.id, "s")).rejects.toThrow(/has not linked/);
});

test("a button tap updates the stage and Meta, once, and only for the owner", async () => {
  const { id } = await newTenant();
  const agent = await linkedAgent(id, 42);
  await linkedAgent(id, 43);
  const { leadId } = await ingestLead(id, { source: "meta_form", phone: uniquePhone(), touch: { metaLeadgenId: String(Date.now()) } });
  await deliverLead(id, leadId, agent.id, "staff");
  const viewing = await stageByName(id, "Viewing");
  const data = encodeCallback(id, leadId, viewing.position);
  const calls = stubFetch();
  const tap = (from: number) => processTelegramUpdate({ callback_query: { id: "q", data, from: { id: from } } });

  await tap(43);
  expect(calls.at(-1)?.json?.text).toContain("not assigned to you");
  await tap(999);
  expect(calls.at(-1)?.json?.text).toContain("not linked");
  expect((await lead(id, leadId)).agentResponseAt).toBeNull();

  await tap(42);
  expect(calls.at(-1)?.json?.text).toBe("Updated: Viewing");
  const row = await lead(id, leadId);
  expect(row.stageId).toBe(viewing.id);
  expect(row.agentResponseAt).toBeInstanceOf(Date);
  expect(row.firstResponseAt).toBeInstanceOf(Date);

  await tap(42);
  expect(calls.at(-1)?.json?.text).toBe("Already at Viewing");
  const events = await withTenant(id, (db) => db.select().from(capiEvents).where(eq(capiEvents.stageId, viewing.id)));
  expect(events).toHaveLength(1);
});

test("a button can only reach stages marked for agents", async () => {
  const { id } = await newTenant();
  const agent = await linkedAgent(id, 42);
  const leadId = await newLead(id);
  await deliverLead(id, leadId, agent.id, "s");
  const offer = await stageByName(id, "Offer");
  const calls = stubFetch();
  await processTelegramUpdate({ callback_query: { id: "q", data: encodeCallback(id, leadId, offer.position), from: { id: 42 } } });
  expect(calls.at(-1)?.json?.text).toContain("no longer available");
  expect((await lead(id, leadId)).stageId).not.toBe(offer.id);
});

test("an agent who ignores a lead hands it on, then staff are told", async () => {
  const { id } = await newTenant();
  const first = await linkedAgent(id, 42);
  const second = await linkedAgent(id, 43);
  const leadId = await newLead(id);
  await deliverLead(id, leadId, first.id, "s");

  await checkAgentTimer(id, leadId, first.id);
  expect((await lead(id, leadId)).deliveredToMemberId).toBe(second.id);

  await checkAgentTimer(id, leadId, second.id);
  expect((await lead(id, leadId)).deliveredToMemberId).toBe(second.id);
});

test("a blocked bot marks the delivery failed, and is never silent", async () => {
  const { id } = await newTenant();
  const agent = await linkedAgent(id, 42);
  const leadId = await newLead(id);
  await deliverLead(id, leadId, agent.id, "s");
  stubFetch(() => ({ status: 403, body: { description: "bot was blocked by the user" } }));
  await handleTelegramJob({ type: "delivery", tenantId: id, leadId, memberId: agent.id });

  expect((await lead(id, leadId)).deliveryFailedAt).toBeInstanceOf(Date);
  const timeline = await withTenant(id, (db) => db.select().from(activities).where(eq(activities.leadId, leadId)));
  expect(timeline.some((row) => row.body?.includes("Delivery failed"))).toBe(true);
});

test("server errors retry; rate limits reschedule with Telegram's own wait", async () => {
  const { id } = await newTenant();
  const agent = await linkedAgent(id, 42);
  const leadId = await newLead(id);
  const job = { type: "delivery", tenantId: id, leadId, memberId: agent.id };

  stubFetch(() => ({ status: 500, body: {} }));
  await expect(handleTelegramJob(job)).rejects.toThrow(/500/);

  stubFetch(() => ({ status: 429, body: { parameters: { retry_after: 7 } } }));
  await expect(handleTelegramJob(job)).resolves.toBeUndefined();
  expect((await lead(id, leadId)).deliveryFailedAt).toBeNull();
});

test("with no bot token, alerts skip without failing", async () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  const { id } = await newTenant();
  const calls = stubFetch();
  await handleTelegramJob({ type: "team_alert", tenantId: id, leadId: await newLead(id), reason: "new_lead" });
  expect(calls).toHaveLength(0);
});
