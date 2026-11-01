import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { GRAPH_URL } from "../capi/send.ts";
import { decryptSecret, encryptSecret } from "../crypto.ts";
import { withPlatform, withTenant } from "../db/client.ts";
import { safeMessage } from "../errors.ts";
import { connections, tenantDirectory, webhookInbox } from "../db/schema.ts";
import { enqueue } from "../jobs/queues.ts";
import { ingestLead, type LeadInput } from "../leads/ingest.ts";
import { alertOps } from "../ops.ts";

const LEAD_FIELDS = "id,created_time,field_data,ad_id,adset_id,campaign_id,form_id";
const POLL_OVERLAP_SECONDS = 1800;

export function verifyMetaSignature(rawBody: string, header: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const actual = Buffer.from(header.slice(7));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type MetaWebhook = {
  entry?: { id?: string; changes?: { field?: string; value?: { leadgen_id?: string; page_id?: string } }[] }[];
};

/** Saves first, so a slow Meta API or a crash loses nothing. */
export async function saveMetaWebhook(body: MetaWebhook) {
  const changes = (body.entry ?? []).flatMap((entry) => entry.changes ?? []).filter((c) => c.field === "leadgen" && c.value?.leadgen_id);
  await withPlatform(async (db) => {
    for (const change of changes) {
      const [row] = await db
        .insert(webhookInbox)
        .values({ source: "meta", externalId: change.value!.leadgen_id!, payload: change.value! })
        .onConflictDoNothing()
        .returning({ id: webhookInbox.id });
      if (row) await enqueue(db, "intake", { type: "meta_lead", inboxId: row.id });
    }
  });
  return changes.length;
}

async function graph<T>(path: string, token: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const response = await fetch(`${GRAPH_URL}/${path}`, { method, headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new MetaApiError(response.status, (await response.text()).slice(0, 500));
  return response.json() as Promise<T>;
}

export class MetaApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(`Meta API ${status}: ${detail}`);
    this.status = status;
  }
}

type MetaLead = {
  id: string;
  created_time?: string;
  field_data?: { name: string; values?: string[] }[];
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
};

const CONTACT_FIELDS = new Set(["full_name", "first_name", "last_name", "email", "phone_number", "phone"]);

export function metaLeadToInput(lead: MetaLead, pageId: string): LeadInput {
  const fields = Object.fromEntries((lead.field_data ?? []).map((field) => [field.name, field.values?.[0] ?? ""]));
  const answers = Object.entries(fields).filter(([key]) => !CONTACT_FIELDS.has(key));
  const name = fields.full_name || [fields.first_name, fields.last_name].filter(Boolean).join(" ") || null;
  const occurredAt = lead.created_time ? new Date(lead.created_time) : new Date();
  return {
    source: "meta_form",
    name,
    email: fields.email,
    phone: fields.phone_number ?? fields.phone,
    consent: { source: "meta_form", text: `Meta lead form ${lead.form_id ?? ""}`.trim(), at: occurredAt },
    custom: answers.length ? { meta_answers: Object.fromEntries(answers) } : {},
    note: answers.length ? answers.map(([key, value]) => `${key}: ${value}`).join("\n") : undefined,
    touch: {
      metaLeadgenId: lead.id,
      pageId,
      formId: lead.form_id,
      adId: lead.ad_id,
      adsetId: lead.adset_id,
      campaignId: lead.campaign_id,
      occurredAt,
    },
  };
}

export async function processMetaLead(inboxId: string) {
  const inbox = await withPlatform(async (db) => {
    const [row] = await db.select().from(webhookInbox).where(eq(webhookInbox.id, inboxId));
    if (!row || row.processedAt) return null;
    const pageId = String(row.payload.page_id);
    const [route] = await db.select().from(tenantDirectory).where(eq(tenantDirectory.key, `page:${pageId}`));
    return { externalId: row.externalId, pageId, tenantId: route?.tenantId };
  });
  if (!inbox) return;

  if (!inbox.tenantId) {
    await markInbox(inboxId, `No tenant for page ${inbox.pageId}`);
    return;
  }

  const token = await pageToken(inbox.tenantId, inbox.pageId);
  if (!token) {
    await markInbox(inboxId, "Page connection has no token");
    await alertOps(`Lead waiting: page ${inbox.pageId} has no token`);
    return;
  }

  try {
    const lead = await graph<MetaLead>(`${inbox.externalId}?fields=${LEAD_FIELDS}`, token);
    await ingestLead(inbox.tenantId, metaLeadToInput(lead, inbox.pageId));
    await markInbox(inboxId);
  } catch (error) {
    await markInboxError(inboxId, safeMessage(error));
    throw error;
  }
}

async function pageToken(tenantId: string, pageId: string) {
  const [connection] = await withTenant(tenantId, (db) =>
    db.select().from(connections).where(eq(connections.externalId, pageId)),
  );
  return connection?.secretEncrypted ? decryptSecret(connection.secretEncrypted) : null;
}

export function markInbox(id: string, error?: string) {
  return withPlatform((db) =>
    db.update(webhookInbox).set({ processedAt: new Date(), error: error ?? null }).where(eq(webhookInbox.id, id)),
  );
}

export function markInboxError(id: string, error: string) {
  return withPlatform((db) => db.update(webhookInbox).set({ error: error.slice(0, 500) }).where(eq(webhookInbox.id, id)));
}

/** The safety net for webhooks Meta never sent. Replays are harmless. */
export async function pollMetaLeads(tenantId: string) {
  const pages = await withTenant(tenantId, (db) => db.select().from(connections).where(eq(connections.kind, "page")));
  let found = 0;
  for (const page of pages) {
    if (!page.secretEncrypted) continue;
    const token = decryptSecret(page.secretEncrypted);
    const lastPolled = Number(page.config.lastPolledAt ?? 0);
    const since = Math.max(lastPolled - POLL_OVERLAP_SECONDS, Math.floor(Date.now() / 1000) - 7 * 86_400);
    const startedAt = Math.floor(Date.now() / 1000);
    try {
      const forms = await graph<{ data: { id: string }[] }>(`${page.externalId}/leadgen_forms?fields=id&limit=100`, token);
      const filtering = encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: since }]));
      for (const form of forms.data) {
        const leads = await graph<{ data: MetaLead[] }>(`${form.id}/leads?fields=${LEAD_FIELDS}&filtering=${filtering}&limit=100`, token);
        for (const lead of leads.data) {
          const result = await ingestLead(tenantId, metaLeadToInput(lead, page.externalId));
          if (result.created) found++;
        }
      }
      await setConnection(tenantId, page.id, {
        status: "ok",
        lastError: null,
        config: { ...page.config, lastPolledAt: startedAt },
      });
    } catch (error) {
      if (!(error instanceof MetaApiError)) throw error;
      await setConnection(tenantId, page.id, { status: "error", lastError: error.message });
      if (error.status === 401 || error.status === 403) await alertOps(`Page connection failed for tenant ${tenantId}`);
    }
  }
  return found;
}

function setConnection(tenantId: string, id: string, values: Partial<typeof connections.$inferInsert>) {
  return withTenant(tenantId, (db) => db.update(connections).set(values).where(eq(connections.id, id)));
}

export async function saveConnection(
  tenantId: string,
  input: { kind: "page" | "ad_account" | "dataset"; externalId: string; name?: string; secret?: string; testEventCode?: string },
  actor: string,
) {
  return withTenant(
    tenantId,
    async (db) => {
      const values = {
        tenantId,
        kind: input.kind,
        externalId: input.externalId,
        name: input.name,
        testEventCode: input.testEventCode,
        ...(input.secret ? { secretEncrypted: encryptSecret(input.secret) } : {}),
      };
      const [row] = await db
        .insert(connections)
        .values(values)
        .onConflictDoUpdate({ target: [connections.kind, connections.externalId], set: values })
        .returning({ id: connections.id });
      if (input.kind === "page") {
        await db
          .insert(tenantDirectory)
          .values({ key: `page:${input.externalId}`, kind: "page", tenantId })
          .onConflictDoNothing();
      }
      return row.id;
    },
    actor,
  );
}

/**
 * Checks a new connection with Meta straight away, so a bad token shows on screen
 * and not days later. A page must also be subscribed, or Meta never sends its
 * webhooks and only the 15-minute poll finds leads. Returns the problem, if any.
 */
export async function verifyConnection(tenantId: string, connectionId: string) {
  const [row] = await withTenant(tenantId, (db) => db.select().from(connections).where(eq(connections.id, connectionId)));
  if (!row?.secretEncrypted || row.kind === "dataset") return null; // Datasets are checked by "Send a test event".
  const token = decryptSecret(row.secretEncrypted);
  try {
    if (row.kind === "page") {
      await graph(`${row.externalId}/subscribed_apps?subscribed_fields=leadgen`, token, "POST");
      await setConnection(tenantId, row.id, { status: "ok", lastError: null });
    } else {
      const account = await graph<{ currency?: string; timezone_name?: string }>(`${row.externalId}?fields=currency,timezone_name`, token);
      await setConnection(tenantId, row.id, { status: "ok", lastError: null, config: { ...row.config, currency: account.currency, timezone: account.timezone_name } });
    }
    return null;
  } catch (error) {
    const message = error instanceof MetaApiError ? error.message : "Couldn't reach Meta";
    await setConnection(tenantId, row.id, { status: "error", lastError: message.slice(0, 500) });
    return message;
  }
}
