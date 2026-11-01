import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { withPlatform, withTenant } from "../lib/db/client.ts";
import { activities, adInsightsDaily, capiEvents, contacts, leads, touches, webhookInbox } from "../lib/db/schema.ts";
import { saveConnection } from "../lib/intake/meta.ts";
import { ingestLead } from "../lib/leads/ingest.ts";
import { changeStage } from "../lib/leads/work.ts";
import { applyRetention, cleanInbox, eraseContact, exportContact } from "../lib/privacy.ts";
import { campaignReport, syncSpend, teamReport } from "../lib/reports.ts";
import { addMember, newTenant, stageByName, stubFetch, uniquePhone } from "./helpers.ts";

const today = new Date().toISOString().slice(0, 10);

test("the campaign report matches a hand calculation, and labels manual leads", async () => {
  const { id } = await newTenant();
  const qualified = await stageByName(id, "Qualified");
  const won = await stageByName(id, "Won");
  const lead = (campaignId: string) =>
    ingestLead(id, { source: "landing_page", phone: uniquePhone(), touch: { campaignId } }).then((r) => r.leadId);

  const [a, b, c] = [await lead("c1"), await lead("c1"), await lead("c1")];
  await lead("c1");
  await changeStage(id, a, qualified.id, "t");
  await changeStage(id, b, qualified.id, "t");
  await changeStage(id, c, won.id, "t");
  await ingestLead(id, { source: "manual", phone: uniquePhone(), touch: { campaignId: "c1" } });

  await withTenant(id, (db) =>
    db.insert(adInsightsDaily).values({ tenantId: id, date: today, campaignId: "c1", campaignName: "Villas", adsetId: "s", adId: "a1", spend: "400", currency: "AED" }),
  );

  const { campaigns } = await campaignReport(id, today, today);
  const villas = campaigns.find((row) => row.campaignId === "c1");
  // 4 traced leads, 3 reached qualified or won, 1 won, on 400 of spend.
  expect(villas).toMatchObject({ name: "Villas", leads: 4, qualified: 3, won: 1, spend: 400, costPerLead: 100, costPerQualified: 133.33, costPerDeal: 400 });
  expect(campaigns.find((row) => row.manual)).toMatchObject({ name: "Manual entries", leads: 1, spend: 0, costPerLead: 0 });
  expect(JSON.stringify(campaigns)).not.toMatch(/\+971/);
});

test("spend sync stores days, follows pages, and can run twice", async () => {
  const { id } = await newTenant();
  await saveConnection(id, { kind: "ad_account", externalId: `act_${id}`, secret: "t" }, "t");
  const row = (adId: string, spend: string) => ({
    date_start: today, campaign_id: "c1", campaign_name: "Villas", adset_id: "s", ad_id: adId, spend,
    impressions: "10", clicks: "2", actions: [{ action_type: "lead", value: "3" }], account_currency: "AED",
  });
  const calls = stubFetch(({ url }) =>
    url.includes("page2")
      ? { body: { data: [row("a2", "20")] } }
      : { body: { data: [row("a1", "10")], paging: { next: "https://graph.test/page2" } } },
  );

  expect(await syncSpend(id)).toBe(2);
  expect(calls).toHaveLength(2);
  stubFetch(() => ({ body: { data: [row("a1", "15")] } }));
  await syncSpend(id);

  const rows = await withTenant(id, (db) => db.select().from(adInsightsDaily));
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.adId === "a1")).toMatchObject({ spend: "15.00", leads: 3, impressions: 10, currency: "AED" });
});

test("the team report counts leads and response time per person", async () => {
  const { id } = await newTenant();
  const agent = await addMember(id, { name: "Dana" });
  const { leadId } = await ingestLead(id, { source: "manual", phone: uniquePhone() });
  const assignedAt = new Date(Date.now() - 600_000);
  await withTenant(id, (db) =>
    db.update(leads).set({ ownerMemberId: agent.id, assignedAt, firstResponseAt: new Date(assignedAt.getTime() + 300_000) }).where(eq(leads.id, leadId)),
  );
  const report = await teamReport(id, today, today);
  expect(report.people.find((row) => row.name === "Dana")).toMatchObject({ leads: 1, avg_response_minutes: 5 });
  expect(report.funnel.find((row) => row.name === "New")?.leads).toBe(1);
});

async function fullContact(id: string) {
  const phone = uniquePhone();
  const { leadId } = await ingestLead(id, {
    source: "landing_page",
    name: "Erase Me",
    phone,
    email: `erase-${phone.slice(1)}@example.com`,
    note: "Personal note",
    consent: { source: "landing_page", text: "I agree" },
    touch: { fbc: "fb.1.1.A", clientIp: "1.2.3.4", userAgent: "UA", pixelEventId: `px-${phone}`, campaignId: "c1" },
    custom: { budget: 5 },
  });
  const [{ contactId }] = await withTenant(id, (db) => db.select({ contactId: leads.contactId }).from(leads).where(eq(leads.id, leadId)));
  return { leadId, contactId, phone };
}

test("export returns everything held on one person", async () => {
  const { id } = await newTenant();
  const { contactId, leadId } = await fullContact(id);
  const data = await exportContact(id, contactId, "tester");
  expect(data?.contact.name).toBe("Erase Me");
  expect(data?.leads[0].id).toBe(leadId);
  expect(data?.touches[0].clientIp).toBe("1.2.3.4");
  expect(data?.activities.some((row) => row.body === "Personal note")).toBe(true);
  expect(await exportContact(id, "00000000-0000-4000-8000-000000000000", "t")).toBeNull();
});

test("erasing removes personal data everywhere, and reports keep the count", async () => {
  const { id } = await newTenant();
  const { contactId, leadId, phone } = await fullContact(id);
  const email = `erase-${phone.slice(1)}@example.com`;
  await withPlatform((db) =>
    db.insert(webhookInbox).values({ source: "landing_page", externalId: `raw-${id}`, payload: { phone, email } }),
  );

  expect(await eraseContact(id, contactId, "tester")).toBe(true);

  await withTenant(id, async (db) => {
    const [contact] = await db.select().from(contacts);
    expect(contact).toMatchObject({ name: null, phoneE164: null, phoneRaw: null, email: null, consentText: null });
    expect(contact.erasedAt).toBeInstanceOf(Date);
    const [touch] = await db.select().from(touches);
    expect(touch).toMatchObject({ clientIp: null, userAgent: null, fbc: null, campaignId: "c1" });
    const timeline = await db.select().from(activities).where(eq(activities.leadId, leadId));
    expect(timeline.every((row) => row.body === null)).toBe(true);
    const [lead] = await db.select().from(leads);
    expect(lead.custom).toEqual({});
    const events = await db.select().from(capiEvents);
    expect(events.every((row) => row.status === "skipped")).toBe(true);
  });

  const raw = await withPlatform((db) => db.select().from(webhookInbox).where(eq(webhookInbox.externalId, `raw-${id}`)));
  expect(raw).toEqual([]);

  const { campaigns } = await campaignReport(id, today, today);
  expect(campaigns.find((row) => row.campaignId === "c1")?.leads).toBe(1);
  // The same person can come back as a new contact.
  expect((await ingestLead(id, { source: "manual", phone })).created).toBe(true);
});

test("retention erases only people past the period with no recent lead activity", async () => {
  const { id } = await newTenant();
  const old = await fullContact(id);
  const active = await fullContact(id);
  const fresh = await fullContact(id);
  const longAgo = new Date(Date.now() - 800 * 86_400_000);
  await withTenant(id, async (db) => {
    await db.update(contacts).set({ createdAt: longAgo }).where(eq(contacts.id, old.contactId));
    await db.update(leads).set({ updatedAt: longAgo }).where(eq(leads.id, old.leadId));
    await db.update(contacts).set({ createdAt: longAgo }).where(eq(contacts.id, active.contactId));
  });

  expect(await applyRetention(id)).toBe(1);
  const rows = await withTenant(id, (db) => db.select().from(contacts));
  expect(rows.find((row) => row.id === old.contactId)?.erasedAt).toBeInstanceOf(Date);
  expect(rows.find((row) => row.id === active.contactId)?.erasedAt).toBeNull();
  expect(rows.find((row) => row.id === fresh.contactId)?.erasedAt).toBeNull();
  expect(await applyRetention(id)).toBe(0);
});

test("the inbox drops rows older than 30 days", async () => {
  const oldId = `old-${Date.now()}`;
  const newId = `new-${Date.now()}`;
  await withPlatform((db) =>
    db.insert(webhookInbox).values([
      { source: "meta", externalId: oldId, payload: {}, receivedAt: new Date(Date.now() - 31 * 86_400_000) },
      { source: "meta", externalId: newId, payload: {} },
    ]),
  );
  await cleanInbox();
  const left = await withPlatform((db) => db.select().from(webhookInbox));
  expect(left.some((row) => row.externalId === oldId)).toBe(false);
  expect(left.some((row) => row.externalId === newId)).toBe(true);
});
