import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { withTenant } from "../lib/db/client.ts";
import { activities, contacts, customFieldDefs, leads, stageHistory, touches } from "../lib/db/schema.ts";
import { enqueue, getBoss } from "../lib/jobs/queues.ts";
import { ingestLead } from "../lib/leads/ingest.ts";
import { changeStage, exportCsv, fieldError, getLead, importCsv, listLeads, logCall, setCustomFields, todayTasks, createTask } from "../lib/leads/work.ts";
import { can, ForbiddenError, requireMember } from "../lib/permissions.ts";
import { maskPhone, normalizePhone } from "../lib/phone.ts";
import { addMember, newTenant, stageByName, uniquePhone } from "./helpers.ts";

const everyone = { memberId: null, recordScope: "all" } as const;

test("phones normalize to E.164 and bad ones are kept and flagged", () => {
  expect(normalizePhone("050 123 4567", "AE").phoneE164).toBe("+971501234567");
  expect(normalizePhone("+1 (415) 555-2671", "AE").phoneE164).toBe("+14155552671");
  expect(normalizePhone("not a phone", "AE")).toEqual({ phoneE164: null, phoneRaw: "not a phone", phoneInvalid: true });
  expect(normalizePhone("", "AE").phoneRaw).toBeNull();
  expect(maskPhone("+971501234567")).toBe("+971•••567");
});

test("a new lead lands in the first stage with its touch", async () => {
  const { id } = await newTenant();
  const result = await ingestLead(id, {
    source: "landing_page",
    name: "Sara",
    phone: "050 777 1234",
    email: " Sara@Example.COM ",
    touch: { utmCampaign: "villas", fbc: "fb.1.1.Abc" },
    consent: { source: "landing_page", text: "I agree" },
  });
  expect(result).toMatchObject({ created: true, replay: false });

  const lead = await getLead(id, result.leadId, everyone);
  expect(lead?.stage.name).toBe("New");
  expect(lead?.contact).toMatchObject({ email: "sara@example.com", phoneE164: "+971507771234", consentText: "I agree" });
  // Tracking values keep their exact casing, or Meta's match fails.
  expect(lead?.touches[0]).toMatchObject({ utmCampaign: "villas", fbc: "fb.1.1.Abc" });
});

test("the same phone adds a touch to the open lead", async () => {
  const { id } = await newTenant();
  const phone = uniquePhone();
  const first = await ingestLead(id, { source: "manual", phone });
  const second = await ingestLead(id, { source: "landing_page", phone, name: "Later Name" });

  expect(second).toMatchObject({ leadId: first.leadId, created: false });
  await withTenant(id, async (db) => {
    expect((await db.select().from(leads)).length).toBe(1);
    expect((await db.select().from(touches)).length).toBe(2);
    expect((await db.select().from(contacts))[0].name).toBe("Later Name");
  });
});

test("a closed lead coming back opens a new lead for the same person", async () => {
  const { id } = await newTenant();
  const phone = uniquePhone();
  const first = await ingestLead(id, { source: "manual", phone });
  await changeStage(id, first.leadId, (await stageByName(id, "Lost")).id, "tester");
  const second = await ingestLead(id, { source: "manual", phone });
  expect(second.created).toBe(true);
  expect(second.leadId).not.toBe(first.leadId);
});

test("phone wins when phone and email point at two people, and the lead is flagged", async () => {
  const { id } = await newTenant();
  const phone = uniquePhone();
  const byPhone = await ingestLead(id, { source: "manual", phone });
  await ingestLead(id, { source: "manual", email: "other@example.com" });
  const result = await ingestLead(id, { source: "manual", phone, email: "other@example.com" });

  expect(result.leadId).toBe(byPhone.leadId);
  const lead = await getLead(id, byPhone.leadId, everyone);
  expect(lead?.lead.needsReview).toBe(true);
  expect(lead?.contact.email).toBeNull();
});

test("an unparsable phone is kept, and a lead with nothing is rejected", async () => {
  const { id } = await newTenant();
  const { leadId } = await ingestLead(id, { source: "manual", phone: "call me maybe" });
  expect((await getLead(id, leadId, everyone))?.contact).toMatchObject({ phoneRaw: "call me maybe", phoneInvalid: true, phoneE164: null });
  await expect(ingestLead(id, { source: "manual", name: "No contact" })).rejects.toThrow(/phone or an email/);
});

test("the same Meta lead twice creates one lead", async () => {
  const { id } = await newTenant();
  const input = { source: "meta_form" as const, phone: uniquePhone(), touch: { metaLeadgenId: "123" } };
  const first = await ingestLead(id, input);
  const second = await ingestLead(id, input);
  expect(second).toEqual({ leadId: first.leadId, created: false, replay: true });
  await withTenant(id, async (db) => expect((await db.select().from(touches)).length).toBe(1));
});

test("a job queued in a transaction disappears if the transaction rolls back", async () => {
  const { id } = await newTenant();
  const boss = await getBoss();
  let jobId: string | null = null;
  await expect(
    withTenant(id, async (db) => {
      jobId = await enqueue(db, "maintenance", { type: "inbox_cleanup" });
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect(jobId).toBeTruthy();
  expect(await boss.getJobById("maintenance", jobId!)).toBeNull();
});

test("a stage change writes lead, history and timeline together, and skips no-ops", async () => {
  const { id } = await newTenant();
  const { leadId } = await ingestLead(id, { source: "manual", phone: uniquePhone() });
  const won = await stageByName(id, "Won");
  expect(await changeStage(id, leadId, won.id, "tester")).toBe(true);
  expect(await changeStage(id, leadId, won.id, "tester")).toBe(false);

  const lead = await getLead(id, leadId, everyone);
  expect(lead?.lead.status).toBe("won");
  expect(lead?.timeline.filter((row) => row.kind === "stage").length).toBe(1);
  await withTenant(id, async (db) => expect((await db.select().from(stageHistory).where(eq(stageHistory.leadId, leadId))).length).toBe(2));
});

test("a stage from another pipeline is refused", async () => {
  const a = await newTenant();
  const { leadId } = await ingestLead(a.id, { source: "manual", phone: uniquePhone() });
  await expect(changeStage(a.id, leadId, "00000000-0000-4000-8000-000000000000", "t")).rejects.toThrow(/not in this lead's pipeline/);
});

test("logging a call sets first response once", async () => {
  const { id } = await newTenant();
  const { leadId } = await ingestLead(id, { source: "manual", phone: uniquePhone() });
  await logCall(id, leadId, "reached", "Wants a villa", "tester");
  const first = (await getLead(id, leadId, everyone))?.lead.firstResponseAt;
  expect(first).toBeInstanceOf(Date);
  await logCall(id, leadId, "no_answer", null, "tester");
  expect((await getLead(id, leadId, everyone))?.lead.firstResponseAt).toEqual(first);
});

test("listing filters, searches and respects assigned-only agents", async () => {
  const { id } = await newTenant();
  const agent = await addMember(id);
  const mine = await ingestLead(id, { source: "manual", name: "Mine Person", phone: uniquePhone() });
  await ingestLead(id, { source: "manual", name: "Other 100%", phone: uniquePhone() });
  await withTenant(id, (db) => db.update(leads).set({ ownerMemberId: agent.id, temperature: "hot" }).where(eq(leads.id, mine.leadId)));

  expect((await listLeads(id, {}, everyone)).total).toBe(2);
  expect((await listLeads(id, { search: "mine" }, everyone)).rows[0].contact.name).toBe("Mine Person");
  expect((await listLeads(id, { search: "%" }, everyone)).total).toBe(1);
  expect((await listLeads(id, { temperature: "hot" }, everyone)).total).toBe(1);

  const scoped = { memberId: agent.id, recordScope: "assigned" } as const;
  const other = await addMember(id);
  expect((await listLeads(id, {}, scoped)).total).toBe(1);
  expect(await getLead(id, mine.leadId, { memberId: other.id, recordScope: "assigned" })).toBeNull();
});

test("custom fields are validated by the server and filterable", async () => {
  const { id } = await newTenant();
  const { leadId } = await ingestLead(id, { source: "manual", phone: uniquePhone() });
  await withTenant(id, (db) =>
    db.insert(customFieldDefs).values([
      { tenantId: id, key: "budget", label: "Budget", type: "number" },
      { tenantId: id, key: "area", label: "Area", type: "select", options: ["Marina", "Downtown"] },
    ]),
  );
  expect((await setCustomFields(id, leadId, { budget: "lots" }, "t")).errors).toEqual(["Budget must be a number"]);
  expect((await setCustomFields(id, leadId, { area: "Mars" }, "t")).errors).toEqual(["Area is not an allowed option"]);
  expect((await setCustomFields(id, leadId, { nope: 1 }, "t")).errors).toEqual(["Unknown field: nope"]);
  expect((await setCustomFields(id, leadId, { budget: 2000000, area: "Marina" }, "t")).errors).toEqual([]);
  expect((await listLeads(id, { custom: { area: "Marina" } }, everyone)).total).toBe(1);
  expect((await listLeads(id, { custom: { area: "Downtown" } }, everyone)).total).toBe(0);
  expect(fieldError({ key: "x", label: "X", type: "text", required: true } as never, "")).toBe("X is required");
});

test("CSV import reports each row, and export round-trips", async () => {
  const { id } = await newTenant();
  const phone = uniquePhone();
  const csv = `Name,Phone,Email\n"Khan, Ali",${phone},\nDuplicate,${phone},\nNobody,,\n`;
  const report = await importCsv(id, csv, "tester");
  expect(report).toEqual({ created: 1, duplicates: 1, errors: [{ row: 4, message: "A lead needs a phone or an email" }] });
  const exported = await exportCsv(id, {}, everyone);
  expect(exported).toContain('"Khan, Ali"');
  expect(exported).toContain(phone);
});

test("today's list includes overdue and today, not tomorrow, in the tenant's time zone", async () => {
  const { id, timezone } = await newTenant();
  const { leadId } = await ingestLead(id, { source: "manual", phone: uniquePhone() });
  const now = new Date("2026-11-01T18:00:00Z"); // 22:00 in Dubai
  await createTask(id, { leadId, title: "overdue", dueAt: new Date("2026-10-30T10:00:00Z") }, "t");
  await createTask(id, { leadId, title: "later today", dueAt: new Date("2026-11-01T19:30:00Z") }, "t"); // 23:30 Dubai
  await createTask(id, { leadId, title: "tomorrow in Dubai", dueAt: new Date("2026-11-01T20:30:00Z") }, "t"); // 00:30 Dubai
  const rows = await todayTasks(id, timezone, null, now);
  expect(rows.map((row) => row.task.title)).toEqual(["overdue", "later today"]);
});

test("each role can do only what the map allows", async () => {
  expect(can("manager", "connections.manage")).toBe(true);
  expect(can("agent", "connections.manage")).toBe(false);
  expect(can("agent", "leads.write")).toBe(true);
  expect(can("client_viewer", "reports.client")).toBe(true);
  expect(can("client_viewer", "leads.read")).toBe(false);
  expect(can("field_agent", "leads.read")).toBe(false);

  const { id } = await newTenant();
  const userId = "22222222-2222-4222-8222-222222222222";
  await addMember(id, { userId, role: "client_viewer" });
  await expect(requireMember(userId, id, "leads.read")).rejects.toThrow(ForbiddenError);
  await expect(requireMember("33333333-3333-4333-8333-333333333333", id, "leads.read")).rejects.toThrow(ForbiddenError);
  expect((await requireMember(userId, id, "reports.client")).role).toBe("client_viewer");
  await withTenant(id, async (db) => expect(await db.select().from(activities)).toEqual([]));
});
