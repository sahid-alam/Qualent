// A long-lived runner, for local development or a host with always-on workers.
// On Vercel's free plan, the scheduler calls /api/cron/tick instead.
import { drain, tick } from "../lib/jobs/runner.ts";

const LOOP_MS = 2_000;
const TICK_EVERY_MS = 60_000;

let running = true;
process.once("SIGTERM", () => (running = false));
process.once("SIGINT", () => (running = false));

let lastTick = 0;
console.log("worker ready");
while (running) {
  try {
    if (Date.now() - lastTick >= TICK_EVERY_MS) {
      lastTick = Date.now();
      await tick({ budgetMs: 10_000 });
    } else {
      await drain({ budgetMs: 10_000 });
    }
  } catch (error) {
    console.error(`worker loop failed: ${(error as Error).message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, LOOP_MS));
}
process.exit(0);
