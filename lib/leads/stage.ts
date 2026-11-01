import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activities, capiEvents, leads, stageHistory, stages, touches } from "../db/schema.ts";
import { enqueue } from "../jobs/queues.ts";

type Lead = typeof leads.$inferSelect;
type Stage = typeof stages.$inferSelect;

export const STATUS_BY_KIND = { open: "open", qualified: "open", won: "won", lost: "lost" } as const;

/** One stage change, in one transaction: lead, history, timeline, Meta event, automation. */
export async function moveStage(db: Db, tenantId: string, leadId: string, stageId: string, actor: string, depth = 0) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).for("update");
  if (!lead) throw new Error("Lead not found");
  if (lead.stageId === stageId) return false;

  const [stage] = await db
    .select()
    .from(stages)
    .where(and(eq(stages.id, stageId), eq(stages.pipelineId, lead.pipelineId)));
  if (!stage) throw new Error("Stage is not in this lead's pipeline");

  await db
    .update(leads)
    .set({ stageId, status: STATUS_BY_KIND[stage.kind], updatedAt: sql`now()` })
    .where(eq(leads.id, leadId));
  await db.insert(stageHistory).values({ tenantId, leadId, stageId, actor });
  await db.insert(activities).values({
    tenantId,
    leadId,
    kind: "stage",
    body: `Moved to ${stage.name}`,
    data: { stageId },
    actor,
  });
  await queueCapiEvent(db, tenantId, lead, stage);
  await enqueue(db, "automation", { type: "event", tenantId, event: "stage_changed", leadId, stageId, depth });
  return true;
}

export async function enterFirstStage(db: Db, tenantId: string, lead: Lead, stage: Stage, actor: string) {
  await db.insert(stageHistory).values({ tenantId, leadId: lead.id, stageId: stage.id, actor });
  await queueCapiEvent(db, tenantId, lead, stage, true);
}

/** Picks the event shape by the lead's first traceable touch. No Meta ID means no event. */
async function queueCapiEvent(db: Db, tenantId: string, lead: Lead, stage: Stage, isFirstStage = false) {
  if (!stage.capiEnabled) return;

  const allTouches = await db.select().from(touches).where(eq(touches.leadId, lead.id)).orderBy(asc(touches.occurredAt));
  const metaTouch = allTouches.find((touch) => touch.metaLeadgenId);
  const webTouch = allTouches.find((touch) => touch.pixelEventId || touch.fbc || touch.fbp);
  const shape = metaTouch ? "meta_form" : webTouch ? "website" : null;
  if (!shape) return;

  // The first web event shares its id and name with the browser Pixel, so Meta
  // dedupes them. Later stage ids are stable, so re-entering never sends twice.
  const sharesPixelEvent = shape === "website" && isFirstStage && !!webTouch?.pixelEventId;
  const [event] = await db
    .insert(capiEvents)
    .values({
      tenantId,
      leadId: lead.id,
      stageId: stage.id,
      eventId: sharesPixelEvent ? webTouch.pixelEventId! : `${lead.id}:${stage.id}`,
      eventName: sharesPixelEvent ? "Lead" : (stage.capiEventName ?? stage.name),
      shape,
    })
    .onConflictDoNothing()
    .returning();
  if (event) await enqueue(db, "capi", { type: "send", tenantId, eventRowId: event.id });
}
