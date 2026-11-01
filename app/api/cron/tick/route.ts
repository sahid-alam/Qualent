import { timingSafeEqual } from "node:crypto";
import { tick } from "../../../../lib/jobs/runner.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return new Response(null, { status: 401 });
  const processed = await tick();
  return Response.json({ processed });
}
