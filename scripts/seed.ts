// Fills a local database with sample data, to run and review the screens.
// Refuses anything but a local database.
import { eq } from "drizzle-orm";
import { closePool, withPlatform, withTenant } from "../lib/db/client.ts";
import {
  activities,
  adAnalyses,
  adInsightsDaily,
  automationRules,
  capiEvents,
  customFieldDefs,
  leads,
  members,
  profiles,
  stages,
  tasks,
  tenants,
} from "../lib/db/schema.ts";
import { ingestLead } from "../lib/leads/ingest.ts";
import { changeStage } from "../lib/leads/work.ts";
import { stopBoss } from "../lib/jobs/queues.ts";
import { resolveBrand } from "../lib/brand.ts";
import { assignLead, deliverLead } from "../lib/routing.ts";
import { saveRoutingRule } from "../lib/settings.ts";
import { createTenant } from "../lib/tenants.ts";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || process.env.NODE_ENV === "production") {
  throw new Error("Seeding only runs against a local database.");
}

export const SEED_USERS = {
  admin: "00000000-0000-4000-8000-000000000001",
  manager: "00000000-0000-4000-8000-000000000002",
  agent: "00000000-0000-4000-8000-000000000003",
  viewer: "00000000-0000-4000-8000-000000000004",
};

await withPlatform((db) =>
  db
    .insert(profiles)
    .values([
      { id: SEED_USERS.admin, name: "Ayesha (platform admin)", isPlatformAdmin: true },
      { id: SEED_USERS.manager, name: "Sara (manager)" },
      { id: SEED_USERS.agent, name: "Dana (staff)" },
      { id: SEED_USERS.viewer, name: "Khalid (client)" },
    ])
    .onConflictDoNothing(),
);

const tenant = await createTenant({ name: "Marina Homes", template: "uae_real_estate" });
const second = await createTenant({ name: "Desert Motors", template: "general_lead_gen" });
const id = tenant.id;

await withPlatform((db) =>
  db.update(tenants).set({ brand: { name: "Marina Homes", ...resolveBrand("#0f6e8c") } }).where(eq(tenants.id, id)),
);

const person = (values: Partial<typeof members.$inferInsert> & { name: string; role: typeof members.$inferInsert.role }) =>
  withTenant(id, (db) => db.insert(members).values({ tenantId: id, ...values }).returning().then(([row]) => row));

const sara = await person({ name: "Sara", role: "manager", userId: SEED_USERS.manager });
const dana = await person({ name: "Dana", role: "agent", userId: SEED_USERS.agent, weight: 2 });
const omar = await person({ name: "Omar", role: "agent" });
await person({ name: "Khalid", role: "client_viewer", userId: SEED_USERS.viewer });
const hassan = await person({ name: "Hassan K.", role: "field_agent", telegramChatId: "1001", telegramUserId: "1001" });
await person({ name: "Noura S.", role: "field_agent", telegramChatId: "1002", telegramUserId: "1002" });
await person({ name: "Faisal R.", role: "field_agent" });
await withTenant(second.id, (db) => db.insert(members).values({ tenantId: second.id, name: "Sara", role: "manager", userId: SEED_USERS.manager }));

await saveRoutingRule(id, { memberIds: [dana.id, omar.id], slaMinutes: 15, maxReassigns: 2, escalateToMemberId: sara.id }, "seed");

await withTenant(id, (db) =>
  db.insert(customFieldDefs).values([
    { tenantId: id, key: "budget", label: "Budget (AED)", type: "number" },
    { tenantId: id, key: "area", label: "Area", type: "select", options: ["Marina", "Downtown", "JVC"] },
  ]),
);

const stageId = async (name: string) =>
  (await withTenant(id, (db) => db.select().from(stages).where(eq(stages.name, name))))[0].id;

type Row = {
  name: string;
  phone: string;
  campaign?: string;
  stage?: string;
  source?: "meta_form" | "landing_page" | "manual";
  score?: number;
  temp?: "hot" | "warm" | "cold";
  summary?: string;
  next?: string;
  note?: string;
  assign?: boolean;
  deliver?: boolean;
};

const ROWS: Row[] = [
  { name: "Omar Ali", phone: "+971501234567", campaign: "marina", score: 91, temp: "hot", summary: "Ready to view this week, budget 2M for two bedrooms.", next: "Call and offer a Friday viewing.", note: "budget: 2M\nbedrooms: 2", assign: true },
  { name: "Lina Mansour", phone: "+971502223344", campaign: "downtown", source: "landing_page", score: 88, temp: "hot", summary: "Wants a Downtown flat before year end.", next: "Send the Downtown list.", note: "Looking for a flat near the metro." },
  { name: "Rami Ahmed", phone: "+971503334455", source: "manual", note: "Messaged on WhatsApp about Marina villas." },
  { name: "Priya Sharma", phone: "+971504445566", campaign: "marina", stage: "Viewing", score: 74, temp: "warm", summary: "Viewing booked, comparing two towers.", next: "Confirm the viewing time.", assign: true, deliver: true },
  { name: "Yousef Haddad", phone: "+971505556677", campaign: "marina", stage: "Contacted", score: 62, temp: "warm", assign: true },
  { name: "Maya Noor", phone: "+971506667788", campaign: "downtown", stage: "Qualified", score: 80, temp: "hot", summary: "Cash buyer, wants handover in 2027.", assign: true },
  { name: "Daniel Roy", phone: "+971507778899", campaign: "downtown", stage: "Contacted", score: 31, temp: "cold", assign: true },
  { name: "Fatima Zahra", phone: "+971508889900", campaign: "marina", stage: "Won", score: 95, temp: "hot", assign: true, deliver: true },
  { name: "Tariq Aziz", phone: "+971509990011", campaign: "downtown", stage: "Lost", score: 20, temp: "cold", assign: true },
  { name: "Grace Lee", phone: "+971501112233", campaign: "marina", stage: "Offer", score: 84, temp: "hot", assign: true },
];

let first: string | undefined;
for (const [index, row] of ROWS.entries()) {
  const { leadId } = await ingestLead(id, {
    source: row.source ?? (index % 2 ? "landing_page" : "meta_form"),
    name: row.name,
    phone: row.phone,
    note: row.note,
    consent: { source: "seed", text: "Sample consent text" },
    touch:
      row.source === "manual"
        ? undefined
        : index % 2
          ? { campaignId: row.campaign, utmCampaign: row.campaign, fbp: "fb.1.1.sample", pixelEventId: `seed-${index}` }
          : { campaignId: row.campaign, adId: "ad1", metaLeadgenId: `seed-${index}` },
    actor: "seed",
  });
  first ??= leadId;
  if (row.score) {
    await withTenant(id, (db) =>
      db
        .update(leads)
        .set({ score: row.score, temperature: row.temp, summary: row.summary, nextStep: row.next, scoreReason: row.summary })
        .where(eq(leads.id, leadId)),
    );
  }
  if (row.assign) await assignLead(id, leadId);
  if (row.stage) await changeStage(id, leadId, await stageId(row.stage), "seed");
  if (row.deliver) await deliverLead(id, leadId, hassan.id, "seed");
}

const addDays = (days: number) => new Date(Date.now() + days * 86_400_000);
const allLeads = await withTenant(id, (db) => db.select().from(leads));
await withTenant(id, async (db) => {
  await db.insert(tasks).values([
    { tenantId: id, leadId: allLeads[3].id, assigneeMemberId: dana.id, title: "Call back Priya about the second tower", dueAt: addDays(-2) },
    { tenantId: id, leadId: allLeads[0].id, assigneeMemberId: dana.id, title: "Send Omar the villa list", dueAt: addDays(0) },
    { tenantId: id, leadId: allLeads[5].id, assigneeMemberId: sara.id, title: "Confirm Maya's handover date", dueAt: addDays(0) },
    { tenantId: id, leadId: allLeads[4].id, assigneeMemberId: dana.id, title: "Follow up with Yousef", dueAt: addDays(3) },
  ]);
  await db.insert(activities).values({ tenantId: id, leadId: allLeads[3].id, kind: "call", body: "Wants to see both towers.", data: { outcome: "reached" }, actor: "Dana" });

  const today = new Date();
  const spend = [
    ["marina", "Marina villas", "8200", 164],
    ["downtown", "Downtown flats", "4200", 84],
  ] as const;
  for (const [campaignId, campaignName, amount, count] of spend) {
    await db.insert(adInsightsDaily).values({
      tenantId: id,
      date: today.toISOString().slice(0, 10),
      campaignId,
      campaignName,
      adsetId: `${campaignId}-set`,
      adId: `${campaignId}-ad`,
      spend: amount,
      currency: "AED",
      impressions: count * 90,
      clicks: count * 6,
      leads: count,
    });
  }
  await db.insert(adAnalyses).values({
    tenantId: id,
    periodStart: addDays(-7).toISOString().slice(0, 10),
    body: "Marina villas brings more qualified leads than Downtown flats at the same cost per lead. Consider moving budget towards Marina villas.",
  });

  const offer = await db.select().from(stages).where(eq(stages.name, "Viewing"));
  await db.insert(automationRules).values({
    tenantId: id,
    name: "Viewing follow-up",
    trigger: "stage_changed",
    triggerConfig: { stageId: offer[0].id },
    steps: [{ type: "wait", minutes: 1440 }, { type: "create_task", title: "Ask how the viewing went" }],
    exitStageIds: [],
  });
  // So the health view has something to show.
  await db.update(capiEvents).set({ status: "sent", sentAt: new Date() }).where(eq(capiEvents.eventName, "New"));
});

await stopBoss();
await closePool();
console.log(`Seeded. First lead: /c/${id}/leads/${first}`);
