import { after } from "next/server";
import { safeMessage } from "../../../../lib/errors.ts";
import { receiveLandingLead, type LandingResult } from "../../../../lib/intake/landing.ts";
import { FAST_QUEUES } from "../../../../lib/jobs/queues.ts";
import { drain } from "../../../../lib/jobs/runner.ts";
import { reportError } from "../../../../lib/sentry.ts";

export const maxDuration = 60;

const cors = (origin?: string): HeadersInit =>
  origin ? { "access-control-allow-origin": origin, vary: "origin" } : {};

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: {
      ...(origin ? cors(origin) : {}),
      "access-control-allow-methods": "POST",
      "access-control-allow-headers": "content-type",
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("json");
  const body = isJson
    ? await request.json().catch(() => null)
    : await request.formData().then((form) => Object.fromEntries(form.entries()), () => null);

  const result: LandingResult = await receiveLandingLead(key, body, {
    origin: request.headers.get("origin"),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  }).catch(async (error) => {
    console.error(`intake failed: ${safeMessage(error)}`);
    await reportError(error, "intake");
    return { status: 500 };
  });
  if (result.inboxId) after(() => drain({ queues: FAST_QUEUES, budgetMs: 45_000 }));
  if (isJson) return Response.json({ ok: result.status === 200 }, { status: result.status, headers: cors(result.allowOrigin) });
  // A plain form post lands the visitor on this response, so it has to read like a page.
  const text = result.status === 200 ? "Thanks, we got your details." : "That didn't send. Go back, check your details and try again.";
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${text}</title><p>${text}</p>`, {
    status: result.status,
    headers: { "content-type": "text/html; charset=utf-8", ...cors(result.allowOrigin) },
  });
}
