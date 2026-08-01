import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  getMessagingDestination,
  isTelegramConfigured,
} from "../lib/messaging.js";

/**
 * Proactive Telegram delivery via Bot API sendMessage.
 * Prefer this for nightly digests when the user has linked Telegram.
 */
export default defineTool({
  description:
    "Send a Telegram message to the linked user. Use for nightly digests and setup confirmations when Telegram is linked. No-ops cleanly if unlinked or bot token missing.",
  inputSchema: z.object({
    body: z.string().min(1).max(4000),
    chatId: z
      .string()
      .optional()
      .describe("Override chat id; defaults to profile telegramChatId"),
  }),
  async execute({ body, chatId }) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const dest = getMessagingDestination();
    const recipient = chatId ?? dest.telegramChatId;

    if (!token || !isTelegramConfigured()) {
      return {
        sent: false,
        skipped: true,
        reason:
          "Telegram bot not configured (need TELEGRAM_BOT_TOKEN + TELEGRAM_BOT_USERNAME). Return digest as final message instead.",
      };
    }

    if (!recipient) {
      return {
        sent: false,
        skipped: true,
        reason:
          "No telegramChatId in profile yet. Ask the user to open the bot deep link and tap Start, then call save_messaging_destination.",
      };
    }

    if (!dest.consentUpdates && !chatId) {
      return {
        sent: false,
        skipped: true,
        reason:
          "User has not consented to Telegram updates (consentUpdates=false). Confirm consent before sending digests.",
      };
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: recipient,
        text: body,
        disable_web_page_preview: true,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    };

    if (!res.ok || !json.ok) {
      return {
        sent: false,
        error: json.description ?? `HTTP ${res.status}`,
      };
    }

    return {
      sent: true,
      messageId: json.result?.message_id,
      chatId: recipient,
    };
  },
});
