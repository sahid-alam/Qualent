import { desc, eq, isNotNull, isNull, and, sql } from "drizzle-orm";
import { withPlatform, withTenant } from "./db/client.ts";
import { aiModels, aiUsage, capiEvents, connections, leads, tenants, webhookInbox, workerHeartbeat } from "./db/schema.ts";
import { isWorkerHealthy } from "./health.ts";
import { DEAD_LETTER_QUEUE, getBoss } from "./jobs/queues.ts";
import { queueOfType } from "./jobs/runner.ts";

const CONFIGURED: [string, string[]][] = [
  ["Sign-in (Supabase)", ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]],
  ["Scheduler secret", ["CRON_SECRET"]],
  ["Token encryption", ["SECRET_KEY"]],
  ["Meta webhooks", ["META_APP_SECRET", "META_VERIFY_TOKEN"]],
  ["Telegram bot", ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET"]],
  ["Ops alerts on Telegram", ["TELEGRAM_BOT_TOKEN", "OPS_TELEGRAM_CHAT_ID"]],
  ["Error reports (Sentry)", ["SENTRY_DSN"]],
];

/** Whether each service has its settings. Never the values. */
export const serviceChecklist = (env: Record<string, string | undefined> = process.env) =>
  CONFIGURED.map(([label, names]) => ({ label, ready: names.every((name) => !!env[name]) }));

/** 7Gence's view across all clients. Counts only, with no lead data. */
export async function systemStatus() {
  const overall = await withPlatform(async (db) => {
    const [beat] = await db.select().from(workerHeartbeat);
    const queues = await db.execute<{ state: string; count: number }>(sql`
      select state::text, count(*)::int as count from pgboss.job
      where name <> ${DEAD_LETTER_QUEUE} and state in ('created', 'retry', 'active') group by 1
    `);
    const [{ inboxErrors }] = await db
      .select({ inboxErrors: sql<number>`count(*)::int` })
      .from(webhookInbox)
      .where(and(isNotNull(webhookInbox.error), isNull(webhookInbox.processedAt)));
    const list = await db.select().from(tenants).orderBy(tenants.name);
    return { beatAt: beat?.beatAt, queued: Object.fromEntries(queues.rows.map((row) => [row.state, row.count])), inboxErrors, list };
  });

  const clients = [];
  for (const tenant of overall.list) {
    clients.push(
      await withTenant(tenant.id, async (db) => {
        const [events] = await db
          .select({
            failed: sql<number>`count(*) filter (where ${capiEvents.status} = 'failed')::int`,
            expired: sql<number>`count(*) filter (where ${capiEvents.status} = 'expired')::int`,
          })
          .from(capiEvents)
          .where(sql`${capiEvents.eventTime} > now() - interval '7 days'`);
        const [lead] = await db
          .select({
            recent: sql<number>`count(*) filter (where ${leads.createdAt} > now() - interval '7 days')::int`,
            undelivered: sql<number>`count(*) filter (where ${leads.deliveryFailedAt} is not null and ${leads.status} = 'open')::int`,
          })
          .from(leads);
        const [ai] = await db.select({ spent: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` }).from(aiUsage).where(sql`${aiUsage.at} >= date_trunc('month', now())`);
        const [broken] = await db.select({ count: sql<number>`count(*)::int` }).from(connections).where(eq(connections.status, "error"));
        return {
          id: tenant.id,
          name: tenant.name,
          leads: lead.recent,
          metaFailed: events.failed + events.expired,
          undelivered: lead.undelivered,
          brokenConnections: broken.count,
          aiSpent: Number(ai.spent),
          aiBudget: Number(tenant.aiMonthlyBudgetUsd),
        };
      }),
    );
  }
  return { healthy: isWorkerHealthy(overall.beatAt), beatAt: overall.beatAt ?? null, queued: overall.queued, inboxErrors: overall.inboxErrors, clients };
}

type DeadLetter = { id: string; data: { type?: string; tenantId?: string }; output: { message?: string } | null; created_on: Date };

export async function listDeadLetters() {
  const { rows } = await withPlatform((db) =>
    db.execute<DeadLetter>(sql`
      select id, data, source_output as output, created_on from pgboss.job
      where name = ${DEAD_LETTER_QUEUE} and state = 'created' order by created_on desc limit 50
    `),
  );
  return rows;
}

function findDeadLetter(id: string) {
  return withPlatform((db) =>
    db.execute<DeadLetter>(sql`select id, data from pgboss.job where name = ${DEAD_LETTER_QUEUE} and state = 'created' and id = ${id}::uuid`),
  ).then(({ rows }) => rows[0]);
}

/** Sends a failed job back to its queue. Jobs are safe to run twice, so a crash between the two steps is fine. */
export async function retryDeadLetter(id: string) {
  const job = await findDeadLetter(id);
  if (!job) return false;
  const queue = queueOfType(job.data.type ?? "");
  if (!queue) return false;
  const boss = await getBoss();
  await boss.send(queue, job.data);
  await boss.deleteJob(DEAD_LETTER_QUEUE, id);
  return true;
}

export async function dismissDeadLetter(id: string) {
  const boss = await getBoss();
  await boss.deleteJob(DEAD_LETTER_QUEUE, id);
}

export const AI_TASKS = ["lead_insights", "draft_reply", "ad_analysis"] as const;
const LEAD_TASKS: readonly string[] = ["lead_insights", "draft_reply"];

export type AiModelInput = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKeyEnv: string | null;
  priceIn: number;
  priceOut: number;
  noTraining: boolean;
  reasoningEffort: string | null;
  tasks: string[];
};

/** What's wrong with this model setup, written for the admin. Null means fine. */
export function aiModelProblem(input: AiModelInput) {
  const url = URL.parse(input.baseUrl);
  if (!url || (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1")) return "The address must start with https://.";
  // Only variables named for AI, so a typed name can never send another secret to this address.
  if (input.apiKeyEnv && !/^AI_[A-Z0-9_]+$/.test(input.apiKeyEnv)) return "The key's variable name must start with AI_, like AI_OLLAMA_KEY.";
  if (/kimi|moonshot/i.test(`${input.provider} ${input.model} ${input.baseUrl}`) && input.noTraining) return "Kimi's terms allow training on what it receives, so it can't be marked no-training.";
  if (input.tasks.some((task) => LEAD_TASKS.includes(task)) && !input.noTraining) return "Lead scoring and reply drafts send lead data, so they need a no-training model.";
  return null;
}

export function listAiModels() {
  return withPlatform((db) => db.select().from(aiModels).orderBy(desc(aiModels.active), aiModels.model));
}

export function addAiModel(input: AiModelInput, actor: string) {
  return withPlatform((db) => db.insert(aiModels).values({ ...input, priceIn: String(input.priceIn), priceOut: String(input.priceOut) }), actor);
}

export function setAiModelActive(id: string, active: boolean, actor: string) {
  return withPlatform((db) => db.update(aiModels).set({ active }).where(eq(aiModels.id, id)), actor);
}
