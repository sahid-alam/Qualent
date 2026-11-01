type DbError = Error & { code?: unknown; cause?: { code?: unknown } };

/**
 * Text that is safe to log or store. Drizzle puts a failed query's values in its
 * message, and Postgres can quote a bad value, so database errors keep only their
 * code. Those values can be phone numbers and emails.
 */
export function safeMessage(error: unknown) {
  const { message = "Unknown error", code, cause } = (error ?? {}) as DbError;
  const dbCode = cause?.code ?? code;
  if (typeof dbCode === "string" && /^[0-9A-Z]{5}$/.test(dbCode)) return `Database error ${dbCode}`;
  if (message.startsWith("Failed query")) return "Database error";
  return message.slice(0, 500);
}
