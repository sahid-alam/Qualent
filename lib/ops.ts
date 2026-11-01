import { telegramConfigured, tg } from "./telegram/api.ts";

/** Critical problems for 7Gence. Never carries personal data. */
export async function alertOps(text: string) {
  console.error(`ops alert: ${text}`);
  const chatId = process.env.OPS_TELEGRAM_CHAT_ID;
  if (!chatId || !telegramConfigured()) return;
  await tg("sendMessage", { chat_id: chatId, text }).catch((error) => console.error(error.message));
}
