import { and, asc, desc, eq, or } from "drizzle-orm";
import { withTenant, type Db } from "../db/client.ts";
import { activities, contacts, leads, pipelines, stages, touches, type LeadSource } from "../db/schema.ts";
import { enqueue } from "../jobs/queues.ts";
import { normalizePhone } from "../phone.ts";
import { getTenant } from "../tenants.ts";
import { enterFirstStage } from "./stage.ts";

export type TouchInput = Partial<
  Pick<
    typeof touches.$inferInsert,
    | "metaLeadgenId" | "pageId" | "formId" | "adId" | "adsetId" | "campaignId"
    | "utmSource" | "utmMedium" | "utmCampaign" | "utmTerm" | "utmContent"
    | "fbclid" | "fbc" | "fbp" | "pixelEventId" | "eventSourceUrl" | "clientIp" | "userAgent" | "occurredAt"
  >
>;

export type LeadInput = {
  source: LeadSource;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  consent?: { source: string; text: string; at?: Date };
  touch?: TouchInput;
  custom?: Record<string, unknown>;
  note?: string;
  actor?: string;
};

export class InvalidLeadError extends Error {}

/** Every lead source ends here. Safe to run twice on the same event. */
export async function ingestLead(tenantId: string, input: LeadInput) {
  const actor = input.actor ?? input.source;
  return withTenant(
    tenantId,
    async (db) => {
      const replay = await findReplay(db, input.touch);
      if (replay) return { leadId: replay, created: false, replay: true };

      const tenant = await getTenant(db, tenantId);
      const email = input.email?.trim().toLowerCase() || null;
      const phone = normalizePhone(input.phone, tenant.country);
      if (!phone.phoneRaw && !email) throw new InvalidLeadError("A lead needs a phone or an email");

      const { contactId, conflict } = await upsertContact(db, tenantId, input, phone, email);

      const [openLead] = await db
        .select()
        .from(leads)
        .where(and(eq(leads.contactId, contactId), eq(leads.status, "open")))
        .orderBy(desc(leads.createdAt))
        .limit(1);

      const touch = { tenantId, source: input.source, ...input.touch };

      if (openLead) {
        await db.insert(touches).values({ ...touch, leadId: openLead.id });
        await db.insert(activities).values({
          tenantId,
          leadId: openLead.id,
          kind: "system",
          body: `Came back through ${input.source}`,
          actor,
        });
        if (input.note) await addNote(db, tenantId, openLead.id, input.note, actor);
        if (conflict) await db.update(leads).set({ needsReview: true }).where(eq(leads.id, openLead.id));
        return { leadId: openLead.id, created: false, replay: false };
      }

      const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.isDefault, true)).limit(1);
      if (!pipeline) throw new Error("Tenant has no default pipeline");
      const [firstStage] = await db
        .select()
        .from(stages)
        .where(eq(stages.pipelineId, pipeline.id))
        .orderBy(asc(stages.position))
        .limit(1);

      const [lead] = await db
        .insert(leads)
        .values({
          tenantId,
          contactId,
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          custom: input.custom ?? {},
          needsReview: conflict,
        })
        .returning();
      await db.insert(touches).values({ ...touch, leadId: lead.id });
      if (input.note) await addNote(db, tenantId, lead.id, input.note, actor);

      await enterFirstStage(db, tenantId, lead, firstStage, actor);
      await enqueue(db, "routing", { type: "assign", tenantId, leadId: lead.id });
      await enqueue(db, "ai", { type: "lead_insights", tenantId, leadId: lead.id });
      await enqueue(db, "automation", { type: "event", tenantId, event: "lead_created", leadId: lead.id, depth: 0 });
      return { leadId: lead.id, created: true, replay: false };
    },
    actor,
  );
}

async function findReplay(db: Db, touch: TouchInput | undefined) {
  const keys = [
    touch?.metaLeadgenId ? eq(touches.metaLeadgenId, touch.metaLeadgenId) : undefined,
    touch?.pixelEventId ? eq(touches.pixelEventId, touch.pixelEventId) : undefined,
  ].filter(Boolean);
  if (!keys.length) return null;
  const [row] = await db.select({ leadId: touches.leadId }).from(touches).where(or(...keys)).limit(1);
  return row?.leadId ?? null;
}

async function upsertContact(
  db: Db,
  tenantId: string,
  input: LeadInput,
  phone: ReturnType<typeof normalizePhone>,
  email: string | null,
) {
  const [byPhone] = phone.phoneE164
    ? await db.select().from(contacts).where(eq(contacts.phoneE164, phone.phoneE164)).limit(1)
    : [];
  const [byEmail] = email ? await db.select().from(contacts).where(eq(contacts.email, email)).limit(1) : [];

  // Phone wins when phone and email point at two different people.
  const existing = byPhone ?? byEmail;
  const conflict = !!(byPhone && byEmail && byPhone.id !== byEmail.id);
  const consent = input.consent
    ? { consentSource: input.consent.source, consentText: input.consent.text, consentAt: input.consent.at ?? new Date() }
    : {};

  if (!existing) {
    const [created] = await db
      .insert(contacts)
      .values({ tenantId, name: input.name, ...phone, email, ...consent })
      .returning();
    return { contactId: created.id, conflict };
  }

  // Fill gaps only. Never overwrite what staff may have corrected, and never
  // take an email that belongs to another contact.
  await db
    .update(contacts)
    .set({
      name: existing.name ?? input.name,
      phoneE164: existing.phoneE164 ?? phone.phoneE164,
      phoneRaw: existing.phoneRaw ?? phone.phoneRaw,
      email: existing.email ?? (conflict ? null : email),
      ...(existing.consentAt ? {} : consent),
    })
    .where(eq(contacts.id, existing.id));
  return { contactId: existing.id, conflict };
}

export async function addNote(db: Db, tenantId: string, leadId: string, body: string, actor: string) {
  await db.insert(activities).values({ tenantId, leadId, kind: "note", body, actor });
}
