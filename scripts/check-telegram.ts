#!/usr/bin/env npx tsx
/**
 * GS-014/GS-015: print Telegram getWebhookInfo for the configured bot.
 * Does not call setWebhook. Empty URL or last_error_message is an env/
 * registration problem for a human — not an application-code fix.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null;
  if (!token) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "TELEGRAM_BOT_TOKEN is unset",
          botUsername: username,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const res = await fetch(
    `https://api.telegram.org/bot${token}/getWebhookInfo`,
  );
  const json = (await res.json()) as {
    ok?: boolean;
    description?: string;
    result?: {
      url?: string;
      pending_update_count?: number;
      last_error_date?: number;
      last_error_message?: string;
      allowed_updates?: string[] | null;
      ip_address?: string;
    };
  };

  const result = json.result ?? {};
  const url = result.url?.trim() ?? "";
  const lastError = result.last_error_message?.trim() || null;
  const diagnosis = !url
    ? "webhook_unregistered"
    : lastError
      ? "webhook_error"
      : "webhook_ok";

  console.log(
    JSON.stringify(
      {
        ok: Boolean(json.ok && diagnosis === "webhook_ok"),
        botUsername: username,
        diagnosis,
        url: url || null,
        pendingUpdateCount: result.pending_update_count ?? 0,
        lastErrorDate: result.last_error_date ?? null,
        lastErrorMessage: lastError,
        allowedUpdates: result.allowed_updates ?? null,
        ipAddress: result.ip_address ?? null,
        hint:
          diagnosis === "webhook_ok"
            ? "Webhook is registered without a last error. If /start is still silent, inspect channel routing."
            : "Registration/env issue (or the deploy is rejecting Telegram, e.g. 401 from auth middleware). Do not call setWebhook from app code.",
      },
      null,
      2,
    ),
  );

  if (diagnosis !== "webhook_ok") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
