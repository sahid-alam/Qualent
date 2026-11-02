import { createHash } from "node:crypto";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { withTenant, type Db } from "../db/client.ts";
import { capiEvents, connections, contacts, leads, touches } from "../db/schema.ts";
import { decryptSecret } from "../crypto.ts";
import { enqueue } from "../jobs/queues.ts";
import { alertOps } from "../ops.ts";

export const GRAPH_URL = process.env.META_GRAPH_URL ?? "https://graph.facebook.com/v26.0";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function hashEmail(email: string) {
  return sha256(email.trim().toLowerCase());
}

/** Digits with country code and no plus sign, then hashed. */
export function hashPhone(phone: string) {
  return sha256(phone.replace(/\D/g, ""));
}

type PayloadInput = {
  eventId: string;
  eventName: string;
  eventTime: Date;
  shape: "meta_form" | "website";
  email: string | null;
  phone: string | null;
  touch: typeof touches.$inferSelect;
};

export function buildPayload({ eventId, eventName, eventTime, shape, email, phone, touch }: PayloadInput) {
  const hashed = {
    ...(email ? { em: [hashEmail(email)] } : {}),
    ...(phone ? { ph: [hashPhone(phone)] } : {}),
  };
  const base = { event_id: eventId, event_name: eventName, event_time: Math.floor(eventTime.getTime() / 1000) };

  if (shape === "meta_form") {
    return {
      ...base,
      action_source: "system_generated",
      // A string: these ids can exceed JavaScript's safe integer range.
      user_data: { lead_id: touch.metaLeadgenId, ...hashed },
      custom_data: { event_source: "crm", lead_event_source: "Qualent" },
    };
  }
  return {
    ...base,
    action_source: "website",
    event_source_url: touch.eventSourceUrl ?? undefined,
    user_data: {
      ...hashed,
      fbc: touch.fbc ?? undefined,
      fbp: touch.fbp ?? undefined,
      client_ip_address: touch.clientIp ?? undefined,
      client_user_agent: touch.userAgent ?? undefined,
    },
  };
}

/** Returning normally ends the job. Throwing retries it with backoff. */
export async function sendCapiEvent(tenantId: string, eventRowId: string) {
  const prepared = await withTenant(tenantId, (db) => prepare(db, eventRowId));
  if (!prepared) return;

  const { token, datasetId, payload, testEventCode } = prepared;
  // Production refuses test codes, so test traffic can never affect live ads.
  const useTestCode = testEventCode && process.env.VERCEL_ENV !== "production";
  const response = await fetch(`${GRAPH_URL}/${datasetId}/events`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ data: [payload], ...(useTestCode ? { test_event_code: testEventCode } : {}) }),
  });

  if (response.ok) {
    await record(tenantId, eventRowId, { status: "sent", sentAt: new Date(), lastError: null });
    return;
  }

  const detail = await response.text();
  if (response.status === 429 || response.status >= 500) {
    await record(tenantId, eventRowId, { lastError: detail.slice(0, 500) });
    throw new Error(`Meta returned ${response.status}`);
  }
  // A bad token or bad payload will not fix itself, so stop and tell a human.
  await record(tenantId, eventRowId, { status: "failed", lastError: detail.slice(0, 500) });
  await alertOps(`Meta rejected an event for tenant ${tenantId}: ${response.status}`);
  const hour = new Date().toISOString().slice(0, 13);
  await withTenant(tenantId, (db) =>
    enqueue(db, "telegram", { type: "team_alert", tenantId, text: "Meta rejected a result. Check Settings, Meta, in Qualent." }, { singletonKey: `meta-error:${tenantId}:${hour}`, singletonSeconds: 3600 }),
  );
}

async function prepare(db: Db, eventRowId: string) {
  const [event] = await db.select().from(capiEvents).where(eq(capiEvents.id, eventRowId));
  if (!event || event.status === "sent") return null;

  const setStatus = (status: "expired" | "no_connection" | "skipped") =>
    db.update(capiEvents).set({ status }).where(eq(capiEvents.id, eventRowId)).then(() => null);

  if (Date.now() - event.eventTime.getTime() > MAX_AGE_MS) return setStatus("expired");

  const [row] = await db
    .select({ contact: contacts })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(eq(leads.id, event.leadId));
  if (!row || row.contact.erasedAt) return setStatus("skipped");

  const [touch] = await db
    .select()
    .from(touches)
    .where(and(eq(touches.leadId, event.leadId), event.shape === "meta_form" ? isNotNull(touches.metaLeadgenId) : sql`true`))
    .orderBy(asc(touches.occurredAt))
    .limit(1);
  if (!touch) return setStatus("skipped");

  const [dataset] = await db.select().from(connections).where(eq(connections.kind, "dataset")).limit(1);
  if (!dataset?.secretEncrypted) return setStatus("no_connection");

  await db.update(capiEvents).set({ attempts: sql`${capiEvents.attempts} + 1`, status: "queued" }).where(eq(capiEvents.id, eventRowId));
  return {
    token: decryptSecret(dataset.secretEncrypted),
    datasetId: dataset.externalId,
    testEventCode: dataset.testEventCode,
    payload: buildPayload({
      eventId: event.eventId,
      eventName: event.eventName,
      eventTime: event.eventTime,
      shape: event.shape,
      email: row.contact.email,
      phone: row.contact.phoneE164,
      touch,
    }),
  };
}

function record(tenantId: string, id: string, values: Partial<typeof capiEvents.$inferInsert>) {
  return withTenant(tenantId, (db) => db.update(capiEvents).set(values).where(eq(capiEvents.id, id)));
}

/** Data for the per-client health page. */
export async function capiHealth(tenantId: string) {
  return withTenant(tenantId, async (db) => {
    const counts = await db
      .select({ status: capiEvents.status, count: sql<number>`count(*)::int` })
      .from(capiEvents)
      .where(sql`${capiEvents.eventTime} > now() - interval '30 days'`)
      .groupBy(capiEvents.status);
    const [volume] = await db
      .select({
        leads: sql<number>`count(*)::int`,
        won: sql<number>`count(*) filter (where ${leads.status} = 'won')::int`,
      })
      .from(leads)
      .where(sql`${leads.createdAt} > now() - interval '30 days'`);
    const [lastEvent] = await db
      .select({ at: sql<Date | null>`max(${capiEvents.sentAt})` })
      .from(capiEvents);
    const status = Object.fromEntries(counts.map((row) => [row.status, row.count]));
    return {
      status,
      leadsLast30Days: volume.leads,
      // Meta's Conversion Leads floor. Below it, events flow but may not optimize.
      meetsLeadVolume: volume.leads >= 200,
      conversionRate: volume.leads ? volume.won / volume.leads : 0,
      lastSentAt: lastEvent.at,
    };
  });
}
