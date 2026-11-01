const API_URL = process.env.TELEGRAM_API_URL ?? "https://api.telegram.org";

export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN;

export class TelegramError extends Error {
  retryAfter?: number;
  /** Retrying cannot help, for example the user blocked the bot. */
  permanent: boolean;

  constructor(status: number, description: string, retryAfter?: number) {
    super(`Telegram ${status}: ${description}`);
    this.retryAfter = retryAfter;
    this.permanent = status >= 400 && status < 500 && status !== 429;
  }
}

export async function tg(method: string, payload: Record<string, unknown>) {
  const response = await fetch(`${API_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as {
    result?: unknown;
    description?: string;
    parameters?: { retry_after?: number };
  };
  if (!response.ok) {
    throw new TelegramError(response.status, body.description ?? "unknown error", body.parameters?.retry_after);
  }
  return body.result;
}
