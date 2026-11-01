import { expect, test } from "vitest";
import { isWorkerHealthy } from "../lib/health.ts";

const now = new Date("2026-11-01T12:00:00Z");

test("worker health follows heartbeat age", () => {
  expect(isWorkerHealthy(undefined, now)).toBe(false);
  expect(isWorkerHealthy(new Date("2026-11-01T11:59:00Z"), now)).toBe(true);
  expect(isWorkerHealthy(new Date("2026-11-01T11:58:00Z"), now)).toBe(false);
});
