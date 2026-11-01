import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { and, asc, eq, sql } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import { withPlatform, withTenant } from "../lib/db/client.ts";
import { activities, auditLog, automationRules, automationRuns, capiEvents, contacts, customFieldDefs, leads, members, profiles, routingRules, stages, tenants, webhookInbox } from "../lib/db/schema.ts";
import { handleEvent } from "../lib/automation.ts";
import { NotRoutableError } from "../lib/routing.ts";
import { handleTelegramJob } from "../lib/telegram/messages.ts";
import { sendCapiEvent } from "../lib/capi/send.ts";
import { receiveLandingLead } from "../lib/intake/landing.ts";
import { saveConnection, verifyConnection } from "../lib/intake/meta.ts";
import { landingSnippet } from "../lib/intake/snippet.ts";
import { getBoss } from "../lib/jobs/queues.ts";
import { drain } from "../lib/jobs/runner.ts";
import { ingestLead } from "../lib/leads/ingest.ts";
import { bulkUpdateLeads, changeStage, coerceField, exportCsv, filtersFromQuery, getLead, listLeads, setCustomFields } from "../lib/leads/work.ts";
import { eraseContact, exportContact } from "../lib/privacy.ts";
import { buildEvent, reportError, scrubText } from "../lib/sentry.ts";
import { addPerson, addStage, claimInvites, deleteStage, saveCustomField, saveStage, sendTestEvent, setupStatus, shiftStage, StageError } from "../lib/settings.ts";
import { aiModelProblem, listDeadLetters, retryDeadLetter, serviceChecklist, systemStatus } from "../lib/system.ts";
import { createLinkCode, decodeCallback, encodeCallback, processTelegramUpdate } from "../lib/telegram/updates.ts";
import { addMember, newTenant, runJobs, stageByName, stubFetch, uniquePhone } from "./helpers.ts";

const everyone = { memberId: null, recordScope: "all" as const };
const ordered = (id: string) => withTenant(id, (db) => db.select().from(stages).orderBy(asc(stages.position)));
const newLead = async (id: string) => (await ingestLead(id, { source: "manual", name: "Sam", phone: uniquePhone(), actor: "t" })).leadId;

test("saving a page subscribes it to Meta's lead webhooks", async () => {
  const { id } = await newTenant();
  const rowId = await saveConnection(id, { kind: "page", externalId: `p-${id}`, secret: "token" }, "t");
  const calls = stubFetch();
  expect(await verifyConnection(id, rowId)).toBeNull();
  expect(calls[0].url).toContain(`p-${id}/subscribed_apps?subscribed_fields=leadgen`);
  expect(calls[0].init?.method).toBe("POST");
});

test("a bad token shows on setup straight away", async () => {
  const { id } = await newTenant();
  const rowId = await saveConnection(id, { kind: "page", externalId: `p-${id}`, secret: "bad" }, "t");
  stubFetch(() => ({ status: 401, body: { error: "bad token" } }));
  expect(await verifyConnection(id, rowId)).toContain("401");
  expect((await setupStatus(id)).page.state).toBe("problem");
});

test("an ad account in another currency or time zone warns", async () => {
  const { id } = await newTenant();
  const rowId = await saveConnection(id, { kind: "ad_account", externalId: `act_${id}`, secret: "t" }, "t");
  stubFetch(() => ({ body: { currency: "USD", timezone_name: "America/New_York" } }));
  await verifyConnection(id, rowId);
  const { adAccountWarning } = await setupStatus(id);
  expect(adAccountWarning).toContain("USD");
  expect(adAccountWarning).toContain("America/New_York");
});

test("Meta rejecting an event also alerts the team group, with no lead data", async () => {
  const { id } = await newTenant();
  await withTenant(id, (db) => db.update(tenants).set({ telegramTeamChatId: "-1" }).where(eq(tenants.id, id)));
  const leadId = (await ingestLead(id, { source: "meta_form", name: "Sam", phone: uniquePhone(), touch: { metaLeadgenId: `l-${randomUUID()}`, pageId: "p" } })).leadId;
  await saveConnection(id, { kind: "dataset", externalId: `ds-${id}`, secret: "t" }, "t");
  const [event] = await withTenant(id, (db) => db.select().from(capiEvents).where(eq(capiEvents.leadId, leadId)));
  process.env.TELEGRAM_BOT_TOKEN = "x";
  const calls = stubFetch((call) => (call.url.includes("/events") ? { status: 400, body: { error: "bad" } } : undefined));
  await sendCapiEvent(id, event.id);
  await runJobs();
  delete process.env.TELEGRAM_BOT_TOKEN;
  const alert = calls.find((call) => String(call.json?.text ?? "").includes("Meta rejected"));
  expect(alert?.json?.chat_id).toBe("-1");
});

test("the test event button is refused in production", async () => {
  const { id } = await newTenant();
  const calls = stubFetch();
  vi.stubEnv("VERCEL_ENV", "production");
  expect((await sendTestEvent(id, "TEST1")).ok).toBe(false);
  vi.unstubAllEnvs();
  expect(calls).toHaveLength(0);
});

test("the team group link adds the bot to a group and refuses a private chat", async () => {
  const { id } = await newTenant();
  const { code, url } = await createLinkCode(id, null);
  expect(url).toContain(`startgroup=${code}`);
  stubFetch();
  await processTelegramUpdate({ message: { text: `/start ${code}`, chat: { id: 5, type: "private" }, from: { id: 5 } } });
  const team = () => withTenant(id, (db) => db.select().from(tenants).where(eq(tenants.id, id))).then(([row]) => row.telegramTeamChatId);
  expect(await team()).toBeNull();
  await processTelegramUpdate({ message: { text: `/start@Bot ${code}`, chat: { id: -9, type: "group" }, from: { id: 5 } } });
  expect(await team()).toBe("-9");
});

test("reordering stages doesn't change what an old Telegram button does", async () => {
  const { id } = await newTenant();
  const agent = await addMember(id, { role: "field_agent", telegramChatId: "7", telegramUserId: "7" });
  const leadId = await newLead(id);
  await withTenant(id, (db) => db.update(leads).set({ deliveredToMemberId: agent.id }).where(eq(leads.id, leadId)));
  const viewing = await stageByName(id, "Viewing");
  const button = encodeCallback(id, leadId, viewing.id);
  await shiftStage(id, viewing.id, "up", "t");
  stubFetch();
  await processTelegramUpdate({ callback_query: { id: "q", data: button, from: { id: 7 } } });
  const [lead] = await withTenant(id, (db) => db.select().from(leads).where(eq(leads.id, leadId)));
  expect(lead.stageId).toBe(viewing.id);
});

test("stages rename, reorder and add, and new leads always start in an open stage", async () => {
  const { id } = await newTenant();
  const [first, second] = await ordered(id);
  await shiftStage(id, second.id, "up", "t");
  expect((await ordered(id))[0].id).toBe(second.id);
  await addStage(id, { name: "Handover", kind: "qualified" }, "t");
  expect((await ordered(id)).at(-1)?.name).toBe("Handover");
  await saveStage(id, first.id, { name: "Fresh", kind: "open" }, "t");
  await expect(saveStage(id, second.id, { name: "Contacted", kind: "won" }, "t")).rejects.toBeInstanceOf(StageError);
  const won = await stageByName(id, "Won");
  await expect(
    (async () => {
      for (let step = 0; step < 10; step++) await shiftStage(id, won.id, "up", "t");
    })(),
  ).rejects.toBeInstanceOf(StageError);
});

test("changing what a stage means updates the leads in it", async () => {
  const { id } = await newTenant();
  const leadId = await newLead(id);
  const offer = await stageByName(id, "Offer");
  await changeStage(id, leadId, offer.id, "t");
  await saveStage(id, offer.id, { name: "Offer", kind: "won" }, "t");
  const [lead] = await withTenant(id, (db) => db.select().from(leads).where(eq(leads.id, leadId)));
  expect(lead.status).toBe("won");
});

test("a stage with history, or used by a rule, can't be deleted", async () => {
  const { id } = await newTenant();
  await newLead(id);
  const first = await stageByName(id, "New");
  await expect(deleteStage(id, first.id, "t")).rejects.toThrow("history");
  const offer = await stageByName(id, "Offer");
  await withTenant(id, (db) => db.insert(automationRules).values({ tenantId: id, name: "r", trigger: "stage_changed", triggerConfig: { stageId: offer.id }, steps: [{ type: "alert", text: "x" }] }));
  await expect(deleteStage(id, offer.id, "t")).rejects.toThrow("automation");
  await addStage(id, { name: "Spare", kind: "open" }, "t");
  const spare = await stageByName(id, "Spare");
  await deleteStage(id, spare.id, "t");
  expect((await ordered(id)).some((stage) => stage.id === spare.id)).toBe(false);
});

test("custom fields from forms keep their type, and can be filtered on", async () => {
  const { id } = await newTenant();
  await saveCustomField(id, { key: "cash", label: "Cash buyer", type: "boolean" }, "t");
  await saveCustomField(id, { key: "budget", label: "Budget", type: "number" }, "t");
  const defs = await withTenant(id, (db) => db.select().from(customFieldDefs));
  const a = await newLead(id);
  const b = await newLead(id);
  expect((await setCustomFields(id, a, { cash: "true", budget: "2000000" }, "t")).errors).toEqual([]);
  expect((await setCustomFields(id, b, { cash: "false", budget: "" }, "t")).errors).toEqual([]);
  expect((await setCustomFields(id, b, { budget: "lots" }, "t")).errors[0]).toContain("number");
  const found = await listLeads(id, filtersFromQuery({ f_cash: "true", f_budget: "2000000" }, defs), everyone);
  expect(found.rows.map((row) => row.lead.id)).toEqual([a]);
  expect((await getLead(id, a, everyone))?.lead.custom.budget).toBe(2_000_000);
  expect(coerceField(defs[0], "")).toBeNull();
  expect((await saveCustomField(id, { key: "cash", label: "Again", type: "text" }, "t"))).toBe(false);
});

test("exports contain every matching lead, and are audited", async () => {
  const { id } = await newTenant();
  const leadId = await newLead(id);
  const manyRows = Array.from({ length: 205 }, () => ({ contactName: `P${randomUUID()}` }));
  const [lead] = await withTenant(id, (db) => db.select().from(leads).where(eq(leads.id, leadId)));
  await withTenant(id, async (db) => {
    for (const row of manyRows) {
      const [contact] = await db.insert(contacts).values({ tenantId: id, name: row.contactName }).returning();
      await db.insert(leads).values({ tenantId: id, contactId: contact.id, pipelineId: lead.pipelineId, stageId: lead.stageId });
    }
  });
  const csv = await exportCsv(id, {}, everyone, "user:a");
  expect(csv.trim().split("\n")).toHaveLength(207);
  await exportContact(id, lead.contactId, "user:a");
  const logged = await withTenant(id, (db) => db.select().from(auditLog).where(and(eq(auditLog.action, "export"), eq(auditLog.actor, "user:a"))));
  expect(logged.map((row) => row.tableName).sort()).toEqual(["contacts", "leads"]);
});

test("the first sign-in creates a profile, and never resets an admin", async () => {
  const userId = randomUUID();
  await claimInvites(userId, `${userId}@example.invalid`);
  const profile = () => withPlatform((db) => db.select().from(profiles).where(eq(profiles.id, userId))).then(([row]) => row);
  expect((await profile()).name).toBe(userId);
  await withPlatform((db) => db.update(profiles).set({ isPlatformAdmin: true }).where(eq(profiles.id, userId)));
  await claimInvites(userId, `${userId}@example.invalid`);
  expect((await profile()).isPlatformAdmin).toBe(true);
});

test("a job that fails for good alerts ops, shows on the system page, and can be retried", async () => {
  const { id } = await newTenant();
  const boss = await getBoss();
  process.env.TELEGRAM_BOT_TOKEN = "x";
  process.env.OPS_TELEGRAM_CHAT_ID = "-77";
  const calls = stubFetch();
  // A real type, on a lead that doesn't exist? It would succeed. Force a throw with a bad row id.
  await boss.send("automation", { type: "sweep", tenantId: "not-a-uuid" }, { retryLimit: 0 });
  await drain({ queues: ["automation"], budgetMs: 5000 });
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.OPS_TELEGRAM_CHAT_ID;
  expect(calls.some((call) => call.json?.chat_id === "-77" && String(call.json?.text).includes("failed for good"))).toBe(true);

  const [job] = (await listDeadLetters()).filter((row) => row.data.tenantId === "not-a-uuid");
  expect(job).toBeTruthy();
  expect(job.output?.message).toBeTruthy();
  expect(await retryDeadLetter(job.id)).toBe(true);
  expect((await listDeadLetters()).some((row) => row.id === job.id)).toBe(false);
  const status = await systemStatus();
  expect(status.clients.find((client) => client.id === id)?.leads).toBe(0);
});

test("AI model rules protect lead data and other secrets", () => {
  const good = { provider: "Ollama", baseUrl: "https://ollama.com/v1", model: "gemma", apiKeyEnv: "AI_OLLAMA_KEY", priceIn: 0, priceOut: 0, noTraining: true, reasoningEffort: null, tasks: ["lead_insights"] };
  expect(aiModelProblem(good)).toBeNull();
  expect(aiModelProblem({ ...good, noTraining: false })).toContain("no-training");
  expect(aiModelProblem({ ...good, noTraining: false, tasks: ["ad_analysis"] })).toBeNull();
  expect(aiModelProblem({ ...good, apiKeyEnv: "SECRET_KEY" })).toContain("AI_");
  expect(aiModelProblem({ ...good, provider: "Kimi", model: "kimi-k3" })).toContain("Kimi");
  expect(aiModelProblem({ ...good, baseUrl: "http://example.com/v1" })).toContain("https");
  expect(aiModelProblem({ ...good, baseUrl: "http://localhost:11434/v1" })).toBeNull();
});

test("Sentry never receives personal data", async () => {
  const error = new Error("Lead omar@example.com called from +971 50 123 4567");
  const event = buildEvent(error, "request", "abc");
  expect(JSON.stringify(event)).not.toContain("omar@");
  expect(JSON.stringify(event)).not.toContain("123 4567");
  expect(event.exception.values[0].stacktrace.frames.length).toBeGreaterThan(0);
  expect(scrubText(Object.assign(new Error("Failed query: insert ... params: +971501234567"), { cause: { code: "23505" } }))).toBe("Database error 23505");

  const sent: { url: string; body: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, body: String(init.body), headers: init.headers as Record<string, string> });
    return new Response("{}");
  }));
  vi.stubEnv("SENTRY_DSN", "https://pubkey@o1.ingest.sentry.io/42");
  await reportError(error, "request");
  vi.unstubAllEnvs();
  expect(sent[0].url).toBe("https://o1.ingest.sentry.io/api/42/envelope/");
  expect(sent[0].headers["x-sentry-auth"]).toContain("sentry_key=pubkey");
  expect(sent[0].body.split("\n").map((line) => JSON.parse(line))[1]).toEqual({ type: "event" });

  await expect(reportError(new Error("x"), "request")).resolves.toBeUndefined();
});

test("the landing snippet only sends fields the endpoint accepts", async () => {
  const { id } = await newTenant();
  const snippet = landingSnippet("https://app.example", "KEY");
  expect(snippet).toContain('action="https://app.example/api/intake/KEY"');
  for (const name of ["event_id", "page_url", "fbclid", "fbp", "fbc", "utm_source", "utm_campaign", "consent_text", "website"]) expect(snippet).toContain(name);
  const key = await withPlatform((db) => db.execute<{ key: string }>(sql`select key from tenant_directory where kind = 'intake_key' and tenant_id = ${id}::uuid`)).then((result) => result.rows[0].key.replace("intake:", ""));
  const result = await receiveLandingLead(key, { name: "Lina", phone: uniquePhone(), event_id: randomUUID(), fbc: "fb.1.1.abc", fbp: "fb.1.1.1", utm_source: "fb", utm_campaign: "c", page_url: "https://x.example/?a=1", consent_text: "ok" }, { origin: null, ip: "1.1.1.1", userAgent: "UA" });
  expect(result.status).toBe(200);
});

test("the service list reports settings without revealing them", () => {
  const list = serviceChecklist({ TELEGRAM_BOT_TOKEN: "t0ken-value", TELEGRAM_BOT_USERNAME: "b", TELEGRAM_WEBHOOK_SECRET: "s" });
  expect(list.find((row) => row.label === "Telegram bot")?.ready).toBe(true);
  expect(list.find((row) => row.label === "Error reports (Sentry)")?.ready).toBe(false);
  expect(JSON.stringify(list)).not.toContain("t0ken-value");
});

test("erasing a contact leaves other clients' waiting leads alone", async () => {
  const { id } = await newTenant();
  const other = await newTenant();
  const { leadId } = await ingestLead(id, { source: "landing_page", name: "Odd", phone: "1", actor: "t" });
  const [lead] = await withTenant(id, (db) => db.select().from(leads).where(eq(leads.id, leadId)));
  const phone = uniquePhone();
  await withPlatform((db) =>
    db.insert(webhookInbox).values([
      { source: "landing_page", externalId: `other-${other.id}`, payload: { tenantId: other.id, phone: "+971500000111" } },
      { source: "landing_page", externalId: `same-${other.id}`, payload: { tenantId: other.id, phone: "1" } },
      { source: "meta", externalId: `meta-${other.id}`, payload: { leadgen_id: "1", page_id: "1" } },
      { source: "landing_page", externalId: `mine-${id}`, payload: { tenantId: id, phone: "1", other: phone } },
    ]),
  );
  await eraseContact(id, lead.contactId, "t");
  const left = await withPlatform((db) => db.select({ externalId: webhookInbox.externalId }).from(webhookInbox)).then((rows) => rows.map((row) => row.externalId));
  expect(left).toContain(`other-${other.id}`);
  expect(left).toContain(`same-${other.id}`);
  expect(left).toContain(`meta-${other.id}`);
  expect(left).not.toContain(`mine-${id}`);
});

test("a failed automation retries instead of sticking", async () => {
  const { id } = await newTenant();
  const leadId = await newLead(id);
  const [rule] = await withTenant(id, (db) => db.insert(automationRules).values({ tenantId: id, name: "r", trigger: "lead_created", steps: [{ type: "move_stage", stageId: randomUUID() }] }).returning());
  await handleEvent(id, "lead_created", leadId, undefined, 0);
  await drain({ queues: ["automation"], budgetMs: 5000 }).catch(() => 0);
  const [run] = await withTenant(id, (db) => db.select().from(automationRuns).where(eq(automationRuns.ruleId, rule.id)));
  expect(run.status).toBe("running");
  const queued = await withPlatform((db) => db.execute<{ state: string }>(sql`select state::text from pgboss.job where name = 'automation' and data->>'runId' = ${run.id}`));
  expect(queued.rows.map((row) => row.state)).toContain("retry");
});

test("an agent's personal link is refused in a group", async () => {
  const { id } = await newTenant();
  const agent = await addMember(id, { role: "field_agent" });
  const { code } = await createLinkCode(id, agent.id);
  stubFetch();
  await processTelegramUpdate({ message: { text: `/start@Bot ${code}`, chat: { id: -5, type: "group" }, from: { id: 5 } } });
  const [row] = await withTenant(id, (db) => db.select().from(members).where(eq(members.id, agent.id)));
  expect(row.telegramChatId).toBeNull();
});

test("a deactivated agent can't press buttons or receive a retried delivery", async () => {
  const { id } = await newTenant();
  const agent = await addMember(id, { role: "field_agent", telegramChatId: "8", telegramUserId: "8", active: false });
  const leadId = await newLead(id);
  await withTenant(id, (db) => db.update(leads).set({ deliveredToMemberId: agent.id }).where(eq(leads.id, leadId)));
  const won = await stageByName(id, "Won");
  const calls = stubFetch();
  await processTelegramUpdate({ callback_query: { id: "q", data: encodeCallback(id, leadId, won.id), from: { id: 8 } } });
  const [lead] = await withTenant(id, (db) => db.select().from(leads).where(eq(leads.id, leadId)));
  expect(lead.stageId).not.toBe(won.id);
  process.env.TELEGRAM_BOT_TOKEN = "x";
  calls.length = 0;
  await handleTelegramJob({ type: "delivery", tenantId: id, leadId, memberId: agent.id });
  delete process.env.TELEGRAM_BOT_TOKEN;
  expect(calls.some((call) => call.json?.chat_id === "8")).toBe(false);
});

test("a forged Telegram button is ignored, not a failing job", () => {
  expect(decodeCallback("s:!!!!:????:abcdefabcdef")).toBeNull();
});

test("adding someone twice neither duplicates the invite nor breaks their sign-in", async () => {
  const { id } = await newTenant();
  const userId = randomUUID();
  const email = `${userId}@example.invalid`;
  await addPerson(id, { name: "A", role: "agent", email }, "t");
  expect(await addPerson(id, { name: "A again", role: "agent", email }, "t")).toBeNull();
  await claimInvites(userId, email);
  await addPerson(id, { name: "A once more", role: "agent", email }, "t");
  await expect(claimInvites(userId, email)).resolves.toBeTruthy();
  const linked = await withTenant(id, (db) => db.select().from(members).where(eq(members.userId, userId)));
  expect(linked).toHaveLength(1);
});

test("a failed query's error doesn't carry the values", async () => {
  const { id } = await newTenant();
  const error = await withTenant(id, (db) => db.execute(sql`select ${"+971501234567"}::uuid`)).catch((caught: Error) => caught);
  const text = inspect(error, { depth: 5 });
  expect(text).not.toContain("971501234567");
  expect((error as Error & { cause: { code: string } }).cause.code).toBe("22P02");
});

test("bad filter values in a link are ignored rather than crashing the page", async () => {
  const { id } = await newTenant();
  const filters = filtersFromQuery({ stage: "x", owner: "y", page: "-3" });
  expect(filters).toMatchObject({ stageIds: undefined, ownerMemberId: undefined, page: 1 });
  await expect(listLeads(id, filters, everyone)).resolves.toBeTruthy();
});

test("bulk assignment checks the person and starts the reply timer", async () => {
  const { id } = await newTenant();
  const staff = await addMember(id);
  const viewer = await addMember(id, { role: "client_viewer" });
  await withTenant(id, (db) => db.insert(routingRules).values({ tenantId: id, memberIds: [staff.id], slaMinutes: 5 }));
  const leadId = await newLead(id);
  await expect(bulkUpdateLeads(id, [leadId], { ownerMemberId: viewer.id }, "t")).rejects.toBeInstanceOf(NotRoutableError);
  const other = await addMember(id);
  await bulkUpdateLeads(id, [leadId], { ownerMemberId: other.id }, "user:a");
  const [lead] = await withTenant(id, (db) => db.select().from(leads).where(eq(leads.id, leadId)));
  expect(lead.ownerMemberId).toBe(other.id);
  expect(lead.assignedAt).toBeInstanceOf(Date);
  const timers = await withPlatform((db) => db.execute<{ id: string }>(sql`select id from pgboss.job where name = 'routing' and data->>'type' = 'reply_timer' and data->>'leadId' = ${leadId} and data->>'memberId' = ${other.id}`));
  expect(timers.rows).toHaveLength(1);
  const timeline = await withTenant(id, (db) => db.select().from(activities).where(and(eq(activities.leadId, leadId), eq(activities.actor, "user:a"))));
  expect(timeline.map((row) => row.kind)).toContain("assignment");
});

test("long tracking values are cut, and null bytes removed, so the lead still arrives", async () => {
  const { id } = await newTenant();
  const key = await withPlatform((db) => db.execute<{ key: string }>(sql`select key from tenant_directory where kind = 'intake_key' and tenant_id = ${id}::uuid`)).then((result) => result.rows[0].key.replace("intake:", ""));
  const result = await receiveLandingLead(key, { name: "a\u0000b", phone: uniquePhone(), utm_content: "x".repeat(900) }, { origin: null, ip: "2.2.2.2", userAgent: "UA" });
  expect(result.status).toBe(200);
});
