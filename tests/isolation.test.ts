import { eq, sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { withPlatform, withTenant, withUser } from "../lib/db/client.ts";
import { auditLog, contacts, leads, members, pipelines, stages, tenants } from "../lib/db/schema.ts";
import { ingestLead } from "../lib/leads/ingest.ts";
import { addMember, newTenant, uniquePhone } from "./helpers.ts";

// Drizzle wraps database errors, so check the database's own message.
const dbError = (promise: Promise<unknown>) =>
  promise.then(
    () => "no error",
    (error: Error) => String((error.cause as Error | undefined)?.message ?? error.message),
  );

const seeded = async () => {
  const tenant = await newTenant();
  const { leadId } = await ingestLead(tenant.id, { source: "manual", name: "Private Person", phone: uniquePhone() });
  return { tenantId: tenant.id, leadId };
};

test("every public table has row-level security on and forced", async () => {
  const rows = await withPlatform((db) =>
    db.execute<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(sql`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `),
  );
  expect(rows.rows.length).toBeGreaterThan(20);
  const open = rows.rows.filter((row) => !row.relrowsecurity || !row.relforcerowsecurity);
  expect(open.map((row) => row.relname)).toEqual([]);
});

test("the app role cannot bypass row-level security", async () => {
  const [role] = await withPlatform((db) =>
    db.execute<{ rolbypassrls: boolean; rolsuper: boolean }>(sql`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`).then((r) => r.rows),
  );
  expect(role).toEqual({ rolbypassrls: false, rolsuper: false });
});

test("tenant A cannot read or change tenant B", async () => {
  const a = await seeded();
  const b = await seeded();

  await withTenant(a.tenantId, async (db) => {
    expect(await db.select().from(leads).where(eq(leads.id, b.leadId))).toEqual([]);
    const seen = await db.select().from(leads);
    expect(seen.every((row) => row.tenantId === a.tenantId)).toBe(true);
    expect(seen.length).toBe(1);
    expect((await db.update(leads).set({ score: 99 }).where(eq(leads.id, b.leadId)).returning()).length).toBe(0);
    expect((await db.delete(leads).where(eq(leads.id, b.leadId)).returning()).length).toBe(0);
    expect((await db.select().from(tenants)).map((row) => row.id)).toEqual([a.tenantId]);
  });

  const [untouched] = await withTenant(b.tenantId, (db) => db.select().from(leads).where(eq(leads.id, b.leadId)));
  expect(untouched.score).toBeNull();
});

test("tenant A cannot write a row into tenant B", async () => {
  const a = await seeded();
  const b = await seeded();
  expect(await dbError(withTenant(a.tenantId, (db) => db.insert(contacts).values({ tenantId: b.tenantId, name: "Injected" })))).toMatch(
    /row-level security/,
  );
});

test("a missing tenant is an error, not all the data", async () => {
  await seeded();
  await expect(withPlatform((db) => db.select().from(leads))).rejects.toThrow();
  await expect(withUser("00000000-0000-4000-8000-000000000000", (db) => db.select().from(contacts))).rejects.toThrow();
});

test("composite keys stop a row pointing at another tenant's row", async () => {
  const a = await seeded();
  const b = await seeded();
  const [bLead] = await withTenant(b.tenantId, (db) => db.select().from(leads).where(eq(leads.id, b.leadId)));
  await withTenant(a.tenantId, async (db) => {
    const [pipeline] = await db.select().from(pipelines);
    const [stage] = await db.select().from(stages).where(eq(stages.pipelineId, pipeline.id));
    expect(
      await dbError(db.insert(leads).values({ tenantId: a.tenantId, contactId: bLead.contactId, pipelineId: pipeline.id, stageId: stage.id })),
    ).toMatch(/foreign key/);
  });
});

test("a user sees only their own memberships across tenants", async () => {
  const a = await seeded();
  const b = await seeded();
  const userId = "11111111-1111-4111-8111-111111111111";
  await addMember(a.tenantId, { userId });
  await addMember(b.tenantId);
  const seen = await withUser(userId, (db) => db.select().from(members));
  expect(seen.map((row) => row.tenantId)).toEqual([a.tenantId]);
});

test("the audit log records changes and cannot be edited", async () => {
  const { tenantId, leadId } = await seeded();
  await withTenant(tenantId, (db) => db.update(leads).set({ score: 50 }).where(eq(leads.id, leadId)), "tester");

  await withTenant(tenantId, async (db) => {
    const rows = await db.select().from(auditLog).where(eq(auditLog.rowId, leadId));
    const update = rows.find((row) => row.action === "update");
    expect(update?.actor).toBe("tester");
    expect(update?.changedColumns).toEqual(["score"]);
  });
  expect(await dbError(withTenant(tenantId, (db) => db.update(auditLog).set({ actor: "x" })))).toMatch(/permission denied/);
  expect(await dbError(withTenant(tenantId, (db) => db.delete(auditLog)))).toMatch(/permission denied/);
});
