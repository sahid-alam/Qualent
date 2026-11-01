import type { Condition, WorkingHours } from "./db/schema.ts";

function read(target: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>(
    (value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined),
    target,
  );
}

export function matches(conditions: Condition[], target: Record<string, unknown>) {
  return conditions.every(({ field, op, value }) => {
    const actual = read(target, field);
    switch (op) {
      case "eq":
        return actual === value;
      case "neq":
        return actual !== value;
      case "in":
        return Array.isArray(value) && value.includes(actual);
      case "gte":
        return Number(actual) >= Number(value);
      case "lte":
        return Number(actual) <= Number(value);
      case "set":
        return actual !== null && actual !== undefined && actual !== "";
    }
  });
}

/** Lowest assignments per weight wins, so equal weights are round robin. */
export function pickByWeight<M extends { id: string; weight: number }>(candidates: M[], counters: Record<string, number>) {
  return [...candidates].sort(
    (a, b) => (counters[a.id] ?? 0) / a.weight - (counters[b.id] ?? 0) / b.weight,
  )[0];
}

export function isWithinHours(hours: WorkingHours | null | undefined, timezone: string, now = new Date()) {
  if (!hours) return true;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const window = hours[String(day)];
  if (!window) return false;
  const time = `${parts.hour}:${parts.minute}`;
  return time >= window.from && time < window.to;
}
