import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { withPlatform, withTenant } from "../db/client.ts";
import { tenantDirectory, tenants, webhookInbox } from "../db/schema.ts";
import { enqueue } from "../jobs/queues.ts";
import { ingestLead, InvalidLeadError } from "../leads/ingest.ts";
import { markInbox } from "./meta.ts";

const RATE_LIMIT_PER_MINUTE = 30;

// Too-long tracking text is cut, not rejected: it must never cost us the lead. Postgres also refuses null bytes.
const text = (max: number) => z.string().transform((value) => value.replaceAll("\0", "").trim().slice(0, max)).optional();

const LandingLead = z.object({
  name: text(200),
  phone: text(40),
  email: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().email().max(320).optional()),
  // A hidden field real people never fill.
  website: z.string().optional(),
  consent_text: text(2000),
  message: text(5000),
  utm_source: text(200),
  utm_medium: text(200),
  utm_campaign: text(200),
  utm_term: text(200),
  utm_content: text(200),
  fbclid: text(500),
  fbc: text(500),
  fbp: text(500),
  event_id: text(200),
  page_url: text(2000),
  campaign_id: text(100),
  ad_id: text(100),
  adset_id: text(100),
});

export type LandingMeta = { origin: string | null; ip: string | null; userAgent: string | null };
export type LandingResult = { status: 200 | 400 | 403 | 404 | 429 | 500; inboxId?: string; allowOrigin?: string };

export async function receiveLandingLead(key: string, body: unknown, meta: LandingMeta): Promise<LandingResult> {
  const [route] = await withPlatform((db) =>
    db.select().from(tenantDirectory).where(and(eq(tenantDirectory.key, `intake:${key}`), eq(tenantDirectory.kind, "intake_key"))),
  );
  if (!route) return { status: 404 };

  const [tenant] = await withTenant(route.tenantId, (db) =>
    db.select({ origins: tenants.intakeOrigins }).from(tenants).where(eq(tenants.id, route.tenantId)),
  );
  if (meta.origin && !tenant.origins.includes(meta.origin)) return { status: 403 };
  const allowOrigin = meta.origin ?? undefined;

  const parsed = LandingLead.safeParse(body);
  if (!parsed.success) return { status: 400, allowOrigin };
  if (parsed.data.website) return { status: 200, allowOrigin }; // Tell bots it worked.
  if (!parsed.data.phone && !parsed.data.email) return { status: 400, allowOrigin };

  const clientKey = `${key}:${meta.ip ?? "unknown"}`;
  return withPlatform(async (db) => {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(webhookInbox)
      .where(
        and(
          eq(webhookInbox.source, "landing_page"),
          eq(webhookInbox.clientKey, clientKey),
          gt(webhookInbox.receivedAt, sql`now() - interval '1 minute'`),
        ),
      );
    if (count >= RATE_LIMIT_PER_MINUTE) return { status: 429 as const, allowOrigin };

    const [row] = await db
      .insert(webhookInbox)
      .values({
        source: "landing_page",
        externalId: parsed.data.event_id ?? randomUUID(),
        clientKey,
        payload: { ...parsed.data, tenantId: route.tenantId, clientIp: meta.ip, userAgent: meta.userAgent },
      })
      .onConflictDoNothing()
      .returning({ id: webhookInbox.id });
    if (row) await enqueue(db, "intake", { type: "landing_lead", inboxId: row.id });
    return { status: 200 as const, inboxId: row?.id, allowOrigin };
  });
}

export async function processLandingLead(inboxId: string) {
  const [row] = await withPlatform((db) => db.select().from(webhookInbox).where(eq(webhookInbox.id, inboxId)));
  if (!row || row.processedAt) return;
  const lead = row.payload as z.infer<typeof LandingLead> & { tenantId: string; clientIp?: string; userAgent?: string };

  try {
    await ingestLead(lead.tenantId, {
      source: "landing_page",
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      note: lead.message,
      consent: lead.consent_text ? { source: "landing_page", text: lead.consent_text, at: row.receivedAt } : undefined,
      touch: {
        utmSource: lead.utm_source,
        utmMedium: lead.utm_medium,
        utmCampaign: lead.utm_campaign,
        utmTerm: lead.utm_term,
        utmContent: lead.utm_content,
        fbclid: lead.fbclid,
        fbc: lead.fbc,
        fbp: lead.fbp,
        pixelEventId: lead.event_id,
        eventSourceUrl: lead.page_url,
        campaignId: lead.campaign_id,
        adId: lead.ad_id,
        adsetId: lead.adset_id,
        clientIp: lead.clientIp,
        userAgent: lead.userAgent,
        occurredAt: row.receivedAt,
      },
    });
    await markInbox(inboxId);
  } catch (error) {
    if (error instanceof InvalidLeadError) return void (await markInbox(inboxId, error.message));
    throw error;
  }
}

