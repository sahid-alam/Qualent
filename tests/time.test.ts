import { expect, test } from "vitest";
import { lastDays, localToUtc } from "../lib/time.ts";

test("a wall-clock time is read in the client's zone, not the server's", () => {
  expect(localToUtc("2026-11-01T14:30", "Asia/Dubai")?.toISOString()).toBe("2026-11-01T10:30:00.000Z");
  expect(localToUtc("2026-07-01T09:00", "America/New_York")?.toISOString()).toBe("2026-07-01T13:00:00.000Z");
  expect(localToUtc("2026-01-01T09:00", "America/New_York")?.toISOString()).toBe("2026-01-01T14:00:00.000Z");
  expect(localToUtc("not a date", "Asia/Dubai")).toBeNull();
});

test("the report range ends today in the client's zone", () => {
  // 21:00 UTC on 1 Nov is already 2 Nov in Dubai.
  expect(lastDays(30, "Asia/Dubai", new Date("2026-11-01T21:00:00Z"))).toEqual({ from: "2026-10-04", to: "2026-11-02" });
});
