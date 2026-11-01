import { reportError } from "./lib/sentry.ts";

/** Errors Next.js catches while rendering a page or running a route. */
export function onRequestError(error: unknown) {
  return reportError(error, "request");
}
