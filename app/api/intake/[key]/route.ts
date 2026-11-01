import { after } from "next/server";
import { receiveLandingLead } from "../../../../lib/intake/landing.ts";
import { FAST_QUEUES } from "../../../../lib/jobs/queues.ts";
import { drain } from "../../../../lib/jobs/runner.ts";

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
  const body = contentType.includes("json")
    ? await request.json().catch(() => null)
    : Object.fromEntries((await request.formData()).entries());

  const result = await receiveLandingLead(key, body, {
    origin: request.headers.get("origin"),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  });
  if (result.inboxId) after(() => drain({ queues: FAST_QUEUES, budgetMs: 45_000 }));
  return Response.json({ ok: result.status === 200 }, { status: result.status, headers: cors(result.allowOrigin) });
}
