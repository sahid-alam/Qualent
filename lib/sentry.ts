import { safeMessage } from "./errors.ts";

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /\+?\d[\d\s().-]{6,}\d/g;

/** Errors can quote what a lead typed. This is the only text that leaves for Sentry. */
export const scrubText = (error: unknown) => safeMessage(error).replace(EMAIL, "[EMAIL]").replace(PHONE, "[PHONE]");

/** The event: error type, cleaned text and code locations. No request, user or values. */
export function buildEvent(error: unknown, where: string, id: string) {
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  const frames = stack.split("\n").flatMap((line) => {
    const match = line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
    return match ? [{ function: match[1] ?? "<anonymous>", filename: match[2], lineno: Number(match[3]), colno: Number(match[4]) }] : [];
  });
  return {
    event_id: id,
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    environment: process.env.VERCEL_ENV ?? "local",
    tags: { where },
    exception: {
      values: [{ type: error instanceof Error ? error.name : "Error", value: scrubText(error), stacktrace: { frames: frames.reverse() } }],
    },
  };
}

// ponytail: Sentry's HTTP API instead of its SDK, whose install brings in a CLI that isn't
// MIT or Apache. No breadcrumbs or source maps. Revisit if their license changes.
export async function reportError(error: unknown, where: string) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const { username: key, host, protocol, pathname } = new URL(dsn);
    const id = crypto.randomUUID().replaceAll("-", "");
    const body = [JSON.stringify({ event_id: id, sent_at: new Date().toISOString() }), JSON.stringify({ type: "event" }), JSON.stringify(buildEvent(error, where, id))].join("\n");
    await fetch(`${protocol}//${host}/api/${pathname.replace(/^\//, "")}/envelope/`, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${key}` },
      body,
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Reporting a failure must never become a second failure.
  }
}
