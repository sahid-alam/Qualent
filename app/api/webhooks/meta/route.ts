import { after } from "next/server";
import { saveMetaWebhook, verifyMetaSignature } from "../../../../lib/intake/meta.ts";
import { drain } from "../../../../lib/jobs/runner.ts";
import { FAST_QUEUES } from "../../../../lib/jobs/queues.ts";

export const maxDuration = 60;

/** Meta's subscription handshake. */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = process.env.META_VERIFY_TOKEN;
  if (token && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === token) {
    return new Response(params.get("hub.challenge") ?? "");
  }
  return new Response(null, { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response(null, { status: 401 });
  }
  await saveMetaWebhook(JSON.parse(raw));
  after(() => drain({ queues: FAST_QUEUES, budgetMs: 45_000 }));
  return new Response(null, { status: 200 });
}
