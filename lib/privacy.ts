import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { withPlatform, withTenant } from "./db/client.ts";
import { activities, auditLog, capiEvents, contacts, leads, tasks, touches, webhookInbox } from "./db/schema.ts";
import { getTenant } from "./tenants.ts";

export async function exportContact(tenantId: string, contactId: string, actor: string) {
  return withTenant(
    tenantId,
    async (db) => {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
      if (!contact) return null;
      await db.insert(auditLog).values({ tenantId, actor, action: "export", tableName: "contacts", rowId: contactId });
      const contactLeads = await db.select().from(leads).where(eq(leads.contactId, contactId));
      const leadIds = contactLeads.map((lead) => lead.id);
      const none = sql`false`;
      return {
        contact,
        leads: contactLeads,
        touches: await db.select().from(touches).where(leadIds.length ? inArray(touches.leadId, leadIds) : none),
        activities: await db.select().from(activities).where(leadIds.length ? inArray(activities.leadId, leadIds) : none),
        tasks: await db.select().from(tasks).where(leadIds.length ? inArray(tasks.leadId, leadIds) : none),
        exportedBy: actor,
        exportedAt: new Date(),
      };
    },
    actor,
  );
}

/** Removes personal data everywhere it lives. Reports keep anonymous counts. */
export async function eraseContact(tenantId: string, contactId: string, actor: string) {
  const identifiers = await withTenant(
    tenantId,
    async (db) => {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
      if (!contact) return null;
      const contactLeads = await db.select({ id: leads.id }).from(leads).where(eq(leads.contactId, contactId));
      const leadIds = contactLeads.map((lead) => lead.id);

      await db
        .update(contacts)
        .set({
          name: null,
          phoneE164: null,
          phoneRaw: null,
          email: null,
          consentText: null,
          erasedAt: sql`now()`,
        })
        .where(eq(contacts.id, contactId));

      if (leadIds.length) {
        await db
          .update(leads)
          .set({ custom: {}, summary: null, scoreReason: null, nextStep: null, updatedAt: sql`now()` })
          .where(inArray(leads.id, leadIds));
        await db.update(activities).set({ body: null, data: {} }).where(inArray(activities.leadId, leadIds));
        await db.update(tasks).set({ title: "(erased)" }).where(inArray(tasks.leadId, leadIds));
        await db
          .update(touches)
          .set({ clientIp: null, userAgent: null, fbc: null, fbp: null, fbclid: null, eventSourceUrl: null })
          .where(inArray(touches.leadId, leadIds));
        await db
          .update(capiEvents)
          .set({ status: "skipped" })
          .where(and(inArray(capiEvents.leadId, leadIds), eq(capiEvents.status, "queued")));
      }
      return [contact.phoneE164, contact.phoneRaw, contact.email].filter((value): value is string => !!value);
    },
    actor,
  );
  if (identifiers === null) return false;

  // Raw landing page copies may still hold this person for up to 30 days. Exact matches in this
  // tenant only: a loose match here would delete other clients' leads that are waiting to process.
  if (identifiers.length) {
    await withPlatform((db) =>
      db.delete(webhookInbox).where(
        and(
          eq(webhookInbox.source, "landing_page"),
          sql`${webhookInbox.payload}->>'tenantId' = ${tenantId}`,
          or(...identifiers.flatMap((value) => [sql`${webhookInbox.payload}->>'phone' = ${value}`, sql`lower(${webhookInbox.payload}->>'email') = ${value.toLowerCase()}`])),
        ),
      ),
    );
  }
  return true;
}

/** Erases contacts with no lead activity inside the tenant's retention period. */
export async function applyRetention(tenantId: string, now = new Date()) {
  const expired = await withTenant(tenantId, async (db) => {
    const tenant = await getTenant(db, tenantId);
    const cutoff = new Date(now.getTime() - tenant.retentionDays * 86_400_000);
    return db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          isNull(contacts.erasedAt),
          lt(contacts.createdAt, cutoff),
          sql`not exists (select 1 from leads l where l.contact_id = ${contacts.id} and l.updated_at >= ${cutoff.toISOString()}::timestamptz)`,
        ),
      );
  });
  for (const { id } of expired) await eraseContact(tenantId, id, "retention");
  return expired.length;
}

export function cleanInbox() {
  return withPlatform((db) => db.delete(webhookInbox).where(sql`${webhookInbox.receivedAt} < now() - interval '30 days'`));
}
