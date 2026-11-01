/** Reads "2026-11-01T14:30" as a wall-clock time in the given zone. */
export function localToUtc(local: string, timezone: string) {
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(guess)) return null;

  const offsetAt = (instant: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
      })
        .formatToParts(instant)
        .map((part) => [part.type, part.value]),
    );
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - instant;
  };
  // A second pass settles times near a daylight-saving change.
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}

/** Default report range: the last 30 days, in the tenant's time zone. */
export function lastDays(days: number, timezone: string, now = new Date()) {
  const format = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
  return { from: format(new Date(now.getTime() - (days - 1) * 86_400_000)), to: format(now) };
}

/** The calendar day in a time zone, as YYYY-MM-DD. These sort and compare as plain strings. */
export function localDay(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}
