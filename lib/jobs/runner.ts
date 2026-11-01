import { eq } from "drizzle-orm";
import { handleEvent, runSteps, sweep } from "../automation.ts";
import { runAdAnalysis, runLeadInsights } from "../ai/tasks.ts";
import { sendCapiEvent } from "../capi/send.ts";
import { withPlatform } from "../db/client.ts";
import { safeMessage } from "../errors.ts";
import { webhookInbox, workerHeartbeat } from "../db/schema.ts";
import { processLandingLead } from "../intake/landing.ts";
import { markInbox, markInboxError, pollMetaLeads, processMetaLead } from "../intake/meta.ts";
import { alertOps } from "../ops.ts";
import { applyRetention, cleanInbox } from "../privacy.ts";
import { syncSpend } from "../reports.ts";
import { reportError } from "../sentry.ts";
import { assignLead, checkAgentTimer, checkReplyTimer } from "../routing.ts";
import { handleTelegramJob } from "../telegram/messages.ts";
import { processTelegramUpdate } from "../telegram/updates.ts";
import { listTenantIds } from "../tenants.ts";
import { getBoss, QUEUES, type JobData, type QueueName } from "./queues.ts";

type D = JobData & Record<string, never>;

async function processTelegramInbox(inboxId: string) {
  const [row] = await withPlatform((db) => db.select().from(webhookInbox).where(eq(webhookInbox.id, inboxId)));
  if (!row || row.processedAt) return;
  try {
    await processTelegramUpdate(row.payload);
    await markInbox(inboxId);
  } catch (error) {
    await markInboxError(inboxId, safeMessage(error));
    throw error;
  }
}

const HANDLERS: Record<string, (data: D) => Promise<unknown>> = {
  "intake/meta_lead": (d) => processMetaLead(d.inboxId),
  "intake/landing_lead": (d) => processLandingLead(d.inboxId),
  "intake/telegram_update": (d) => processTelegramInbox(d.inboxId),
  "routing/assign": (d) => assignLead(d.tenantId!, d.leadId, !!d.retried),
  "routing/reply_timer": (d) => checkReplyTimer(d.tenantId!, d.leadId, d.memberId, d.ruleId),
  "routing/agent_timer": (d) => checkAgentTimer(d.tenantId!, d.leadId, d.memberId),
  "telegram/team_alert": (d) => handleTelegramJob(d),
  "telegram/delivery": (d) => handleTelegramJob(d),
  "capi/send": (d) => sendCapiEvent(d.tenantId!, d.eventRowId),
  "automation/event": (d) => handleEvent(d.tenantId!, d.event as never, d.leadId, d.stageId, Number(d.depth ?? 0)),
  "automation/resume": (d) => runSteps(d.tenantId!, d.runId, Number(d.depth ?? 0)),
  "automation/sweep": (d) => sweep(d.tenantId!),
  "meta/poll": (d) => pollMetaLeads(d.tenantId!),
  "meta/spend": (d) => syncSpend(d.tenantId!),
  "ai/lead_insights": (d) => runLeadInsights(d.tenantId!, d.leadId),
  "ai/ad_analysis": (d) => runAdAnalysis(d.tenantId!),
  "maintenance/retention": (d) => applyRetention(d.tenantId!),
  "maintenance/inbox_cleanup": () => cleanInbox(),
};

/** Which queue a job type belongs to, for sending a dead letter back. */
export function queueOfType(type: string) {
  const name = Object.keys(HANDLERS).find((key) => key.endsWith(`/${type}`));
  return name?.split("/")[0] as QueueName | undefined;
}

const ALL_QUEUES = Object.keys(QUEUES) as QueueName[];
const BATCH_SIZE = 5;

/** Runs due jobs until none are left or time runs out. Safe to run concurrently. */
export async function drain(options: { queues?: QueueName[]; budgetMs?: number } = {}) {
  const { queues = ALL_QUEUES, budgetMs = 50_000 } = options;
  const boss = await getBoss();
  const deadline = Date.now() + budgetMs;
  let processed = 0;

  for (const queue of queues) {
    while (Date.now() < deadline) {
      const jobs = await boss.fetch<JobData>(queue, { batchSize: BATCH_SIZE, includeMetadata: true });
      if (!jobs.length) break;
      for (const job of jobs) {
        const name = `${queue}/${job.data.type}`;
        try {
          const handler = HANDLERS[name];
          if (!handler) throw new Error(`No handler for ${name}`);
          await handler(job.data as D);
          await boss.complete(queue, job.id);
          processed++;
        } catch (error) {
          const message = safeMessage(error);
          console.error(`${name} failed (job ${job.id}): ${message}`);
          await boss.fail(queue, job.id, { message });
          await reportError(error, name);
          if (job.retryCount >= job.retryLimit) await alertOps(`${name} failed for good. See the System page. Job ${job.id}.`);
        }
      }
    }
  }
  return processed;
}

const PERIODIC: { queue: QueueName; type: string; everySeconds: number }[] = [
  { queue: "meta", type: "poll", everySeconds: 900 },
  { queue: "automation", type: "sweep", everySeconds: 900 },
  { queue: "meta", type: "spend", everySeconds: 21_600 },
  { queue: "maintenance", type: "retention", everySeconds: 86_400 },
  { queue: "ai", type: "ad_analysis", everySeconds: 604_800 },
];

/** Called by the scheduler. Writes the heartbeat, queues periodic work, runs what is due. */
export async function tick(options: { budgetMs?: number } = {}) {
  const boss = await getBoss();
  await withPlatform((db) => {
    const beatAt = new Date();
    return db.insert(workerHeartbeat).values({ beatAt }).onConflictDoUpdate({ target: workerHeartbeat.id, set: { beatAt } });
  });

  for (const tenantId of await listTenantIds()) {
    for (const { queue, type, everySeconds } of PERIODIC) {
      await boss.sendThrottled(queue, { type, tenantId }, null, everySeconds, `${type}:${tenantId}`);
    }
  }
  await boss.sendThrottled("maintenance", { type: "inbox_cleanup" }, null, 86_400, "inbox_cleanup");

  // Upkeep is normally on a timer, but functions do not stay alive between ticks.
  await boss.supervise().catch((error) => console.error(`supervise failed: ${safeMessage(error)}`));
  return drain(options);
}
