import { PgBoss, type SendOptions } from "pg-boss";
import type { Db } from "../db/client.ts";
import { safeMessage } from "../errors.ts";

// Order matters: lead alerts run before anything slow.
export const QUEUES = {
  intake: { retryLimit: 5, retryDelay: 30, retryBackoff: true },
  routing: { retryLimit: 5, retryDelay: 30 },
  telegram: { retryLimit: 6, retryDelay: 30, retryBackoff: true },
  capi: { retryLimit: 12, retryDelay: 60, retryBackoff: true, retryDelayMax: 21_600 },
  automation: { retryLimit: 3, retryDelay: 60 },
  meta: { retryLimit: 3, retryDelay: 300 },
  ai: { retryLimit: 2, retryDelay: 120 },
  maintenance: { retryLimit: 2, retryDelay: 600 },
} as const;

export type QueueName = keyof typeof QUEUES;
export const DEAD_LETTER_QUEUE = "dead_letter";
export const FAST_QUEUES: QueueName[] = ["intake", "routing", "telegram"];

export type JobData = { type: string; tenantId?: string; [key: string]: unknown };

let boss: PgBoss | undefined;
let starting: Promise<PgBoss> | undefined;

// Tables come from scripts/db-setup.ts, so this role never migrates. Queue
// upkeep runs in the tick, not on a timer, because functions do not stay alive.
export function getBoss() {
  starting ??= (async () => {
    const instance = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      supervise: false,
      schedule: false,
      migrate: false,
    });
    instance.on("error", (error) => console.error("pg-boss error:", safeMessage(error)));
    await instance.start();
    boss = instance;
    return instance;
  })();
  return starting;
}

export async function stopBoss() {
  await boss?.stop({ graceful: false });
  boss = undefined;
  starting = undefined;
}

/** Queues inside the caller's transaction: the job exists only if the change commits. */
export async function enqueue(db: Db, queue: QueueName, data: JobData, options: SendOptions = {}) {
  const instance = await getBoss();
  return instance.send(queue, data, {
    ...options,
    db: { executeSql: (text, values) => db.$client.query(text, values as unknown[]) },
  });
}
