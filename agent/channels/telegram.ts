import { telegramChannel } from "eve/channels/telegram";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "../lib/db/client.js";
import { channelIdentities } from "../lib/db/schema.js";
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
 *
 * Durable chatId persistence requires a linked channel identity (GS-005).
 * Until then, inbound Telegram still reaches the agent; messaging profile
 * writes happen only when the Telegram user is already linked to a member.
 */

const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");

async function linkedMemberIdForTelegramUser(
  telegramUserId: string,
): Promise<string | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ memberId: channelIdentities.memberId })
      .from(channelIdentities)
      .where(
        and(
          eq(channelIdentities.provider, "telegram"),
          eq(channelIdentities.externalUserId, telegramUserId),
          isNull(channelIdentities.revokedAt),
        ),
      )
      .limit(1);
    return row?.memberId ?? null;
  } catch {
    return null;
  }
}

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

    // Persist chat id on first private inbound when the Telegram user is linked.
    if (message.chat.type === "private" && message.from?.id) {
      try {
        const memberId = await linkedMemberIdForTelegramUser(message.from.id);
        if (memberId) {
          const existing = await getMessagingDestination(memberId);
          if (!existing.telegramChatId && message.chat.id) {
            await saveMessagingDestination(memberId, {
              telegramChatId: String(message.chat.id),
              telegramUsername: message.from?.username ?? undefined,
              consentUpdates: true,
            });
          }
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

    const linkedMemberId = await linkedMemberIdForTelegramUser(from.id);
    if (linkedMemberId) {
      attributes.memberId = linkedMemberId;
    }

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
        subject: from.id,
      },
    };
  },
});
