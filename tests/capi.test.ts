import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, expect, test } from "vitest";
import { buildPayload, capiHealth, hashEmail, hashPhone, sendCapiEvent } from "../lib/capi/send.ts";
import { decryptSecret, encryptSecret } from "../lib/crypto.ts";
import { withTenant } from "../lib/db/client.ts";
import { capiEvents, connections, stages } from "../lib/db/schema.ts";
import { saveConnection } from "../lib/intake/meta.ts";
import { ingestLead } from "../lib/leads/ingest.ts";
import { changeStage } from "../lib/leads/work.ts";
import { newTenant, stageByName, stubFetch, uniquePhone } from "./helpers.ts";

afterEach(() => {
  delete process.env.VERCEL_ENV;
});

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

const events = (tenantId: string) => withTenant(tenantId, (db) => db.select().from(capiEvents));

async function metaLead(tenantId: string, leadgen = String(Date.now())) {
  return ingestLead(tenantId, {
    source: "meta_form",
    phone: "+971 50 123 4567",
    email: " Buyer@Example.com ",
    touch: { metaLeadgenId: leadgen },
  });
}

test("hashing normalizes first, against known values", () => {
  expect(hashEmail(" Buyer@Example.COM ")).toBe(sha("buyer@example.com"));
  expect(hashPhone("+971 50-123 4567")).toBe(sha("971501234567"));
  // Fixed value from an independent tool, so a change to the hash itself fails.
  expect(hashEmail("test@example.com")).toBe("973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b");
});

test("secrets round-trip and are not stored in the clear", () => {
  const stored = encryptSecret("page-token");
  expect(stored).not.toContain("page-token");
  expect(decryptSecret(stored)).toBe("page-token");
  expect(encryptSecret("page-token")).not.toBe(stored);
});

test("Meta form payload uses lead_id unhashed and hashes contact data", () => {
  const payload = buildPayload({
    eventId: "e1",
    eventName: "Qualified",
    eventTime: new Date(1_800_000_000_000),
    shape: "meta_form",
    email: "a@b.co",
    phone: "+971501234567",
    touch: { metaLeadgenId: "9007199254740993" } as never,
  });
  expect(payload).toMatchObject({
    event_id: "e1",
    event_name: "Qualified",
    event_time: 1_800_000_000,
    action_source: "system_generated",
    custom_data: { event_source: "crm", lead_event_source: "Qualent" },
    user_data: { lead_id: "9007199254740993", em: [sha("a@b.co")], ph: [sha("971501234567")] },
  });
});

test("website payload keeps fbc and fbp exact and unhashed", () => {
  const payload = buildPayload({
    eventId: "e2",
    eventName: "Lead",
    eventTime: new Date(),
    shape: "website",
    email: null,
    phone: null,
    touch: { fbc: "fb.1.1.AbC", fbp: "fb.1.2.XyZ", clientIp: "1.2.3.4", userAgent: "UA", eventSourceUrl: "https://x.co/a" } as never,
  });
  expect(payload).toMatchObject({
    action_source: "website",
    event_source_url: "https://x.co/a",
    user_data: { fbc: "fb.1.1.AbC", fbp: "fb.1.2.XyZ", client_ip_address: "1.2.3.4", client_user_agent: "UA" },
  });
});

test("the first web event shares its id with the Pixel; manual leads send nothing", async () => {
  const { id } = await newTenant();
  await ingestLead(id, { source: "landing_page", phone: uniquePhone(), touch: { pixelEventId: "px-1", fbp: "fb.1.2.X" } });
  await ingestLead(id, { source: "manual", phone: uniquePhone() });
  const rows = await events(id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ eventId: "px-1", eventName: "Lead", shape: "website" });
});

test("re-entering a stage never queues a second event", async () => {
  const { id } = await newTenant();
  const { leadId } = await metaLead(id);
  const contacted = await stageByName(id, "Contacted");
  const fresh = await stageByName(id, "New");
  await changeStage(id, leadId, contacted.id, "t");
  await changeStage(id, leadId, fresh.id, "t");
  await changeStage(id, leadId, contacted.id, "t");
  const rows = await events(id);
  expect(rows.map((row) => row.eventName).sort()).toEqual(["Contacted", "New"]);
  expect(rows.find((row) => row.eventName === "Contacted")?.eventId).toBe(`${leadId}:${contacted.id}`);
});

test("a stage with sending turned off queues nothing", async () => {
  const { id } = await newTenant();
  const { leadId } = await metaLead(id);
  const offer = await stageByName(id, "Offer");
  await withTenant(id, (db) => db.update(stages).set({ capiEnabled: false }).where(eq(stages.id, offer.id)));
  await changeStage(id, leadId, offer.id, "t");
  expect((await events(id)).map((row) => row.eventName)).toEqual(["New"]);
});

test("sending reaches the dataset with hashed data, once connected", async () => {
  const { id } = await newTenant();
  await metaLead(id);
  const [event] = await events(id);

  const calls = stubFetch();
  await sendCapiEvent(id, event.id);
  expect(calls).toHaveLength(0);
  expect((await events(id))[0].status).toBe("no_connection");

  await saveConnection(id, { kind: "dataset", externalId: `ds-${id}`, secret: "tok-1", testEventCode: "TEST1" }, "t");
  await sendCapiEvent(id, event.id);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toContain(`/ds-${id}/events`);
  expect((calls[0].init?.headers as Record<string, string>).authorization).toBe("Bearer tok-1");
  expect(calls[0].json?.test_event_code).toBe("TEST1");
  const body = JSON.stringify(calls[0].json);
  expect(body).not.toContain("buyer@example.com");
  expect(body).not.toContain("501234567\"");
  expect((await events(id))[0].status).toBe("sent");

  await sendCapiEvent(id, event.id);
  expect(calls).toHaveLength(1);
});

test("production refuses to send a test event code", async () => {
  const { id } = await newTenant();
  await metaLead(id);
  await saveConnection(id, { kind: "dataset", externalId: `ds-${id}`, secret: "t", testEventCode: "TEST1" }, "t");
  process.env.VERCEL_ENV = "production";
  const calls = stubFetch();
  await sendCapiEvent(id, (await events(id))[0].id);
  expect(calls[0].json).not.toHaveProperty("test_event_code");
});

test("server errors retry; rejected events stop and record why", async () => {
  const { id } = await newTenant();
  await metaLead(id);
  await saveConnection(id, { kind: "dataset", externalId: `ds-${id}`, secret: "t" }, "t");
  const [event] = await events(id);

  stubFetch(() => ({ status: 503, body: { error: "down" } }));
  await expect(sendCapiEvent(id, event.id)).rejects.toThrow(/503/);
  expect((await events(id))[0]).toMatchObject({ status: "queued", attempts: 1 });

  stubFetch(() => ({ status: 400, body: { error: "bad token" } }));
  await sendCapiEvent(id, event.id);
  expect((await events(id))[0].status).toBe("failed");
  expect((await events(id))[0].lastError).toContain("bad token");
});

test("events older than 7 days are marked expired and not sent", async () => {
  const { id } = await newTenant();
  await metaLead(id);
  await saveConnection(id, { kind: "dataset", externalId: `ds-${id}`, secret: "t" }, "t");
  const [event] = await events(id);
  await withTenant(id, (db) =>
    db.update(capiEvents).set({ eventTime: new Date(Date.now() - 8 * 86_400_000) }).where(eq(capiEvents.id, event.id)),
  );
  const calls = stubFetch();
  await sendCapiEvent(id, event.id);
  expect(calls).toHaveLength(0);
  expect((await events(id))[0].status).toBe("expired");
});

test("the health check reports volume and event counts", async () => {
  const { id } = await newTenant();
  await metaLead(id);
  const health = await capiHealth(id);
  expect(health).toMatchObject({ leadsLast30Days: 1, meetsLeadVolume: false, status: { queued: 1 } });
  await withTenant(id, async (db) => expect((await db.select().from(connections)).length).toBe(0));
});
