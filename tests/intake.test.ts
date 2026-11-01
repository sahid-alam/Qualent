import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { withPlatform, withTenant } from "../lib/db/client.ts";
import { contacts, leads, tenants, touches, webhookInbox, workerHeartbeat } from "../lib/db/schema.ts";
import { receiveLandingLead } from "../lib/intake/landing.ts";
import { metaLeadToInput, pollMetaLeads, saveConnection, saveMetaWebhook, verifyMetaSignature } from "../lib/intake/meta.ts";
import { getBoss } from "../lib/jobs/queues.ts";
import { drain, tick } from "../lib/jobs/runner.ts";
import { newTenant, runJobs, stubFetch, uniquePhone } from "./helpers.ts";

const meta = { origin: null, ip: "1.2.3.4", userAgent: "UA" };
const leadCount = (id: string) => withTenant(id, (db) => db.select().from(leads)).then((rows) => rows.length);

function metaLead(id: string, phone: string) {
  return {
    id,
    created_time: "2026-11-01T10:00:00+0000",
    form_id: "form1",
    ad_id: "ad1",
    adset_id: "set1",
    campaign_id: "camp1",
    field_data: [
      { name: "full_name", values: ["Omar Ali"] },
      { name: "phone_number", values: [phone] },
      { name: "email", values: ["omar@example.com"] },
      { name: "budget", values: ["2M"] },
    ],
  };
}

test("Meta's signature is checked against the raw body", () => {
  process.env.META_APP_SECRET = "secret";
  const body = '{"a":1}';
  const good = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
  expect(verifyMetaSignature(body, good)).toBe(true);
  expect(verifyMetaSignature('{"a":2}', good)).toBe(false);
  expect(verifyMetaSignature(body, "sha256=abc")).toBe(false);
  expect(verifyMetaSignature(body, null)).toBe(false);
  delete process.env.META_APP_SECRET;
  expect(verifyMetaSignature(body, good)).toBe(false);
});

test("form answers become a note, and contact fields map across", () => {
  const input = metaLeadToInput(metaLead("9", "+971501234567"), "page1");
  expect(input).toMatchObject({
    name: "Omar Ali",
    email: "omar@example.com",
    phone: "+971501234567",
    note: "budget: 2M",
    touch: { metaLeadgenId: "9", campaignId: "camp1", adId: "ad1", pageId: "page1" },
  });
  expect(input.consent?.source).toBe("meta_form");
  const split = metaLeadToInput({ id: "1", field_data: [{ name: "first_name", values: ["A"] }, { name: "last_name", values: ["B"] }] }, "p");
  expect(split.name).toBe("A B");
});

test("a Meta webhook becomes one lead, even when replayed", async () => {
  const { id } = await newTenant();
  const pageId = `page-${id}`;
  await saveConnection(id, { kind: "page", externalId: pageId, secret: "page-token" }, "t");
  const leadgenId = `lg-${id}`;
  const calls = stubFetch(({ url }) => (url.includes(leadgenId) ? { body: metaLead(leadgenId, uniquePhone()) } : undefined));

  const body = { entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: leadgenId, page_id: pageId } }, { field: "other" }] }] };
  expect(await saveMetaWebhook(body)).toBe(1);
  await saveMetaWebhook(body);
  await runJobs();

  expect(await leadCount(id)).toBe(1);
  expect(calls.filter(({ url }) => url.includes(leadgenId))).toHaveLength(1);
  const [touch] = await withTenant(id, (db) => db.select().from(touches));
  expect(touch).toMatchObject({ metaLeadgenId: leadgenId, campaignId: "camp1" });
  const [inbox] = await withPlatform((db) => db.select().from(webhookInbox).where(eq(webhookInbox.externalId, leadgenId)));
  expect(inbox.processedAt).toBeInstanceOf(Date);
});

test("a webhook for an unknown page is kept with a reason", async () => {
  stubFetch();
  const leadgenId = `lg-${Date.now()}`;
  await saveMetaWebhook({ entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: leadgenId, page_id: "nobody" } }] }] });
  await runJobs();
  const [inbox] = await withPlatform((db) => db.select().from(webhookInbox).where(eq(webhookInbox.externalId, leadgenId)));
  expect(inbox.error).toContain("No tenant");
});

test("if Meta's API is down the job fails and the event is kept for retry", async () => {
  const { id } = await newTenant();
  const pageId = `page-${id}`;
  await saveConnection(id, { kind: "page", externalId: pageId, secret: "t" }, "t");
  stubFetch(() => ({ status: 500, body: { error: "down" } }));
  const leadgenId = `lg-down-${id}`;
  await saveMetaWebhook({ entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: leadgenId, page_id: pageId } }] }] });
  await drain({ queues: ["intake"], budgetMs: 5_000 });

  expect(await leadCount(id)).toBe(0);
  const [inbox] = await withPlatform((db) => db.select().from(webhookInbox).where(eq(webhookInbox.externalId, leadgenId)));
  expect(inbox.processedAt).toBeNull();
  expect(inbox.error).toContain("500");
});

test("the safety poll finds a lead whose webhook never came", async () => {
  const { id } = await newTenant();
  const pageId = `page-${id}`;
  await saveConnection(id, { kind: "page", externalId: pageId, secret: "t" }, "t");
  const phone = uniquePhone();
  const missed = `missed-${id}`;
  stubFetch(({ url }) => {
    if (url.includes("leadgen_forms")) return { body: { data: [{ id: "form1" }] } };
    if (url.includes("form1/leads")) return { body: { data: [metaLead(missed, phone)] } };
  });

  expect(await pollMetaLeads(id)).toBe(1);
  expect(await pollMetaLeads(id)).toBe(0);
  expect(await leadCount(id)).toBe(1);
});

test("a landing page lead arrives with tracking and consent", async () => {
  const { id, intakeKey } = await newTenant();
  const phone = uniquePhone();
  const result = await receiveLandingLead(
    intakeKey,
    {
      name: "Lina",
      phone,
      email: "",
      consent_text: "I agree to be contacted",
      utm_campaign: "villas",
      fbc: "fb.1.1.Abc",
      fbp: "fb.1.2.Xyz",
      event_id: `evt-${id}`,
      page_url: "https://client.example/villas",
      message: "Looking for a villa",
    },
    meta,
  );
  expect(result.status).toBe(200);
  await drain({ queues: ["intake"], budgetMs: 5_000 });

  await withTenant(id, async (db) => {
    const [contact] = await db.select().from(contacts);
    expect(contact).toMatchObject({ name: "Lina", phoneE164: phone, email: null, consentText: "I agree to be contacted", consentSource: "landing_page" });
    expect(contact.consentAt).toBeInstanceOf(Date);
    const [touch] = await db.select().from(touches);
    expect(touch).toMatchObject({ pixelEventId: `evt-${id}`, utmCampaign: "villas", fbc: "fb.1.1.Abc", clientIp: "1.2.3.4", userAgent: "UA" });
  });
});

test("landing page protections: key, origin, honeypot, contact, and rate limit", async () => {
  const { id, intakeKey } = await newTenant();
  expect((await receiveLandingLead("nope", { phone: "1" }, meta)).status).toBe(404);

  expect((await receiveLandingLead(intakeKey, { phone: uniquePhone() }, { ...meta, origin: "https://evil.example" })).status).toBe(403);
  await withPlatform((db) => db.update(tenants).set({ intakeOrigins: ["https://client.example"] }).where(eq(tenants.id, id)));
  const allowed = await receiveLandingLead(intakeKey, { phone: uniquePhone() }, { ...meta, ip: "9.9.9.9", origin: "https://client.example" });
  expect(allowed).toMatchObject({ status: 200, allowOrigin: "https://client.example" });

  const bot = await receiveLandingLead(intakeKey, { phone: uniquePhone(), website: "spam.example" }, { ...meta, ip: "8.8.8.8" });
  expect(bot).toMatchObject({ status: 200 });
  expect(bot.inboxId).toBeUndefined();

  expect((await receiveLandingLead(intakeKey, { name: "No contact" }, meta)).status).toBe(400);
  expect((await receiveLandingLead(intakeKey, { email: "not-an-email" }, meta)).status).toBe(400);
  expect((await receiveLandingLead(intakeKey, null, meta)).status).toBe(400);

  let last = 0;
  for (let i = 0; i < 31; i++) last = (await receiveLandingLead(intakeKey, { phone: `+97150${1000000 + i}` }, { ...meta, ip: "7.7.7.7" })).status;
  expect(last).toBe(429);
});

test("the same landing page event twice creates one lead", async () => {
  const { id, intakeKey } = await newTenant();
  const body = { phone: uniquePhone(), event_id: `dup-${id}` };
  await receiveLandingLead(intakeKey, body, meta);
  const second = await receiveLandingLead(intakeKey, body, meta);
  expect(second.status).toBe(200);
  await drain({ queues: ["intake"], budgetMs: 5_000 });
  expect(await leadCount(id)).toBe(1);
});

test("the tick writes the heartbeat, queues periodic work once, and runs as the app role", async () => {
  await newTenant();
  stubFetch();
  const boss = await getBoss();
  await tick({ budgetMs: 8_000 });
  const [beat] = await withPlatform((db) => db.select().from(workerHeartbeat));
  expect(Date.now() - beat.beatAt.getTime()).toBeLessThan(30_000);

  const first = await boss.getQueue("meta");
  await tick({ budgetMs: 8_000 });
  const second = await boss.getQueue("meta");
  // Throttled: a second tick right away adds no new periodic jobs.
  expect(second?.queuedCount).toBe(first?.queuedCount);
});

test("a job with a delay waits, then runs", async () => {
  const boss = await getBoss();
  const jobId = await boss.send("maintenance", { type: "inbox_cleanup" }, { startAfter: 3 });
  await drain({ queues: ["maintenance"], budgetMs: 2_000 });
  expect((await boss.getJobById("maintenance", jobId!))?.state).toBe("created");
  await new Promise((resolve) => setTimeout(resolve, 3_500));
  await drain({ queues: ["maintenance"], budgetMs: 2_000 });
  expect((await boss.getJobById("maintenance", jobId!))?.state).toBe("completed");
});
