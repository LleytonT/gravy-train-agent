#!/usr/bin/env npx tsx
/**
 * Live Telegram Bot API diagnostic. Loads .env.local / .env and never prints
 * the token. Use this instead of interpolating $TELEGRAM_BOT_TOKEN in curl
 * when the shell variable may be empty.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const {
  diagnoseTelegramBotApiFailure,
  normalizeTelegramBotToken,
  telegramBotApi,
} = await import("../agent/lib/telegram-bot-token.js");

type WebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  ip_address?: string;
  max_connections?: number;
};

type BotUser = {
  id?: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
};

function line(label: string, value: string): void {
  console.log(`${label.padEnd(28)} ${value}`);
}

async function main() {
  const { token, inspection } = normalizeTelegramBotToken(
    process.env.TELEGRAM_BOT_TOKEN,
  );
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? "";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN?.trim() ?? "";
  const loginDomain = process.env.TELEGRAM_LOGIN_DOMAIN?.trim() ?? "";
  line("TELEGRAM_BOT_TOKEN", inspection.present ? `set (len ${inspection.length})` : "UNSET");
  line(
    "token shape",
    inspection.looksLikeToken
      ? `ok (bot id ${inspection.botId})`
      : "invalid — Telegram will 404",
  );
  line("TELEGRAM_BOT_USERNAME", username || "UNSET");
  line("TELEGRAM_WEBHOOK_SECRET", secret ? `set (len ${secret.length})` : "UNSET");
  line("TELEGRAM_LOGIN_DOMAIN", loginDomain || "unset");

  if (inspection.issues.length > 0) {
    console.log("");
    for (const issue of inspection.issues) {
      console.log(`- ${issue}`);
    }
  }

  if (!token) {
    console.log("");
    console.log(
      diagnoseTelegramBotApiFailure({
        httpStatus: 404,
        description: "Not Found",
        token: inspection,
      }),
    );
    process.exit(1);
  }

  const me = await telegramBotApi<BotUser>(token, "getMe");
  if (!me.ok) {
    console.log("");
    console.log(
      diagnoseTelegramBotApiFailure({
        httpStatus: me.httpStatus,
        description: me.description,
        token: inspection,
      }),
    );
    process.exit(1);
  }

  const bot = me.result ?? {};
  line("getMe.username", bot.username ? `@${bot.username}` : "(none)");
  line("getMe.id", bot.id != null ? String(bot.id) : "(none)");

  if (username && bot.username && username !== bot.username) {
    console.log(
      `- TELEGRAM_BOT_USERNAME (@${username}) does not match getMe (@${bot.username}).`,
    );
  }

  const hook = await telegramBotApi<WebhookInfo>(token, "getWebhookInfo");
  if (!hook.ok) {
    console.log("");
    console.log(
      diagnoseTelegramBotApiFailure({
        httpStatus: hook.httpStatus,
        description: hook.description,
        token: inspection,
      }),
    );
    process.exit(1);
  }

  const info = hook.result ?? {};
  line("webhook.url", info.url || "(not registered)");
  line(
    "webhook.pending",
    info.pending_update_count != null ? String(info.pending_update_count) : "?",
  );
  line("webhook.last_error", info.last_error_message || "(none)");

  if (!info.url) {
    console.log("");
    console.log(
      "Token is valid but no webhook is registered. Eve does not call setWebhook. After deploy:",
    );
    console.log(
      '  curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \\',
    );
    console.log('    -H "Content-Type: application/json" \\');
    console.log(
      `    -d '{"url":"https://YOUR_DEPLOY/eve/v1/telegram","secret_token":"'"$TELEGRAM_WEBHOOK_SECRET_TOKEN"'","allowed_updates":["message","callback_query"]}'`,
    );
    process.exit(1);
  }

  if (!info.url.endsWith("/eve/v1/telegram")) {
    console.log(
      `- Webhook URL should end with /eve/v1/telegram (got ${info.url}).`,
    );
    process.exit(1);
  }

  if (!secret) {
    console.log(
      "- TELEGRAM_WEBHOOK_SECRET_TOKEN is unset. Eve rejects unsigned webhook posts.",
    );
    process.exit(1);
  }

  console.log("");
  console.log("ok: Telegram bot token and webhook look configured.");
}

await main();
