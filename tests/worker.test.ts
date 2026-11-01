import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createDb } from "../lib/db/client.ts";
import { workerHeartbeat } from "../lib/db/schema.ts";
import { createSender, ECHO_QUEUE } from "../lib/queue.ts";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required");

const db = createDb(url, 2);
let worker: ChildProcess | undefined;

function startWorker() {
  return new Promise<ChildProcess>((resolve, reject) => {
    const child = spawn("node", ["worker/index.ts"], {
      env: { ...process.env, WORKER_DATABASE_URL: url },
      stdio: ["ignore", "pipe", "inherit"],
    });
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("worker ready")) resolve(child);
    });
    child.once("exit", (code) => reject(new Error(`worker exited: ${code}`)));
  });
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});

afterAll(async () => {
  worker?.kill("SIGKILL");
  await db.$client.end();
});

test("a delayed job survives a worker crash", { timeout: 60_000 }, async () => {
  worker = await startWorker();

  const [row] = await db.select().from(workerHeartbeat);
  expect(Date.now() - row.beatAt.getTime()).toBeLessThan(10_000);

  const sender = createSender(url);
  await sender.start();
  const id = await sender.send(ECHO_QUEUE, {}, { startAfter: 5 });
  expect(id).toBeTruthy();

  worker.removeAllListeners("exit");
  worker.kill("SIGKILL");
  worker = await startWorker();

  let state: string | undefined;
  for (let i = 0; i < 40 && state !== "completed"; i++) {
    await wait(1_000);
    state = (await sender.getJobById(ECHO_QUEUE, id!))?.state;
  }
  await sender.stop({ graceful: false });
  expect(state).toBe("completed");
});
