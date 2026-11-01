import { after } from "next/server";
import { FAST_QUEUES } from "../../../../lib/jobs/queues.ts";
import { drain } from "../../../../lib/jobs/runner.ts";
import { saveTelegramUpdate, verifyTelegramSecret } from "../../../../lib/telegram/updates.ts";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!verifyTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response(null, { status: 401 });
  }
  await saveTelegramUpdate(await request.json());
  after(() => drain({ queues: FAST_QUEUES, budgetMs: 45_000 }));
  return new Response(null, { status: 200 });
}
