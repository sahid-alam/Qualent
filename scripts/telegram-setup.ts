// Points the bot at this deployment. Run once per environment, and again if APP_URL changes.
// npm run telegram:setup
export {};
const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, APP_URL: appUrl } = process.env;
if (!token || !secret || !appUrl) throw new Error("TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and APP_URL are required");

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${appUrl.replace(/\/$/, "")}/api/webhooks/telegram`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  }),
});
const body = (await response.json()) as { ok: boolean; description?: string };
if (!body.ok) throw new Error(`Telegram refused: ${body.description}`);
console.log("Webhook set.");
