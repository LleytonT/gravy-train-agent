import { telegramChannel } from "eve/channels/telegram";

import {
  getMessagingDestination,
  saveMessagingDestination,
} from "../lib/messaging.js";

/**
 * Telegram bot channel (primary push + chat surface alongside Web).
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET_TOKEN  (must match setWebhook secret_token)
 *   TELEGRAM_BOT_USERNAME          (without @)
 *
 * Webhook: POST /eve/v1/telegram
 */

const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");

export default telegramChannel({
  botUsername: botUsername || undefined,
  async onMessage(ctx, message) {
    // Drop bot messages / empty channel noise — mirror Eve defaults lightly.
    if (message.from?.isBot || message.chat.type === "channel") {
      return null;
    }
    const text = (message.text || message.caption).trim();
    if (!text && message.attachments.length === 0) {
      return null;
    }

    // Persist chat id on first private inbound so digests can find the user.
    if (message.chat.type === "private") {
      try {
        const existing = getMessagingDestination();
        if (!existing.telegramChatId && message.chat.id) {
          saveMessagingDestination({
            telegramChatId: String(message.chat.id),
            telegramUsername: message.from?.username ?? undefined,
            consentUpdates: true,
          });
        }
      } catch (err) {
        console.warn(
          "[telegram] failed to persist messaging destination:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    await ctx.telegram.startTyping();

    const from = message.from;
    if (!from) return null;

    const attributes: Record<string, string> = {
      chat_id: message.chat.id,
      chat_type: message.chat.type,
      message_id: message.messageId,
      user_id: from.id,
    };
    if (message.chat.title !== undefined) attributes.chat_title = message.chat.title;
    if (message.messageThreadId !== undefined) {
      attributes.message_thread_id = String(message.messageThreadId);
    }
    if (from.username !== undefined) attributes.username = from.username;

    const isGroup =
      message.chat.type === "group" || message.chat.type === "supergroup";
    const principalId = isGroup
      ? `telegram:${message.chat.id}:${from.id}`
      : `telegram:${from.id}`;

    return {
      auth: {
        attributes,
        authenticator: "telegram-webhook",
        issuer: isGroup ? `telegram:${message.chat.id}` : "telegram",
        principalId,
        principalType: from.isBot ? "service" : "user",
      },
    };
  },
});
