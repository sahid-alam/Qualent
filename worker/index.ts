import { createDb } from "../lib/db/client.ts";
import { workerHeartbeat } from "../lib/db/schema.ts";
import { HEARTBEAT_INTERVAL_MS } from "../lib/health.ts";
import { createWorkerBoss, ECHO_QUEUE } from "../lib/queue.ts";

// Session pooler or direct connection, never the transaction pooler.
const url = process.env.WORKER_DATABASE_URL;
const db = createDb(url, 2);
const boss = createWorkerBoss(url);

boss.on("error", (error) => console.error("pg-boss error:", error.message));

await boss.start();
await boss.createQueue(ECHO_QUEUE);
await boss.work(ECHO_QUEUE, async ([job]) => {
  console.log("echo job ran:", job.id);
});

async function beat() {
  const beatAt = new Date();
  try {
    await db
      .insert(workerHeartbeat)
      .values({ beatAt })
      .onConflictDoUpdate({ target: workerHeartbeat.id, set: { beatAt } });
  } catch (error) {
    console.error("heartbeat failed:", (error as Error).message);
  }
}

await beat();
const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
console.log("worker ready");

async function shutdown() {
  clearInterval(timer);
  await boss.stop({ graceful: true, timeout: 25_000 });
  process.exit(0);
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
