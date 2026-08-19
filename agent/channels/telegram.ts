import { telegramChannel } from "eve/channels/telegram";
import type {
  TelegramCallbackQuery,
  TelegramContext,
  TelegramMessage,
} from "eve/channels/telegram";

import {
  completeSurfaceTurn,
  syncSurfaceSessionCursor,
} from "../lib/conversation.js";
import {
  handleTelegramInbound,
  type TelegramBotAttachment,
  type TelegramBotInbound,
  type TelegramBotReply,
} from "../lib/telegram-bot.js";

/**
 * Telegram bot channel — primary member surface (GS-015).
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET_TOKEN  (must match setWebhook secret_token)
 *   TELEGRAM_BOT_USERNAME          (without @)
 *
 * Webhook: POST /eve/v1/telegram
 *
 * Commands are routed before the LLM. Bare /start always replies.
 * Deep-link tokens (`/start <token>`) keep the GS-005 consume path.
 * Usernames alone cannot link an account — identity is the Telegram user ID.
 * Username-only linking is not supported.
 */

const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");

function attachmentsOf(message: TelegramMessage): TelegramBotAttachment[] {
  return message.attachments.map((item) => ({
    fileId: item.fileId,
    fileName: item.fileName,
    mediaType: item.mediaType,
    kind: item.kind,
  }));
}

function inboundFromMessage(message: TelegramMessage): TelegramBotInbound | null {
  const from = message.from;
  if (!from) return null;
  return {
    kind: "message",
    text: (message.text || message.caption).trim(),
    telegramUserId: from.id,
    chatId: message.chat.id,
    username: from.username,
    displayName: [from.firstName, from.lastName].filter(Boolean).join(" ").trim() || null,
    messageId: message.messageId,
    attachments: attachmentsOf(message),
  };
}

function inboundFromCallback(
  query: TelegramCallbackQuery,
): TelegramBotInbound | null {
  const chatId = query.message?.chat.id;
  if (!chatId) return null;
  return {
    kind: "callback",
    text: query.data ?? "",
    telegramUserId: query.from.id,
    chatId,
    username: query.from.username,
    displayName:
      [query.from.firstName, query.from.lastName].filter(Boolean).join(" ").trim() ||
      null,
    messageId: query.message?.messageId ?? query.id,
    attachments: [],
    callbackData: query.data,
    callbackQueryId: query.id,
  };
}

async function postReply(
  ctx: TelegramContext,
  result: TelegramBotReply,
): Promise<void> {
  if (result.skipDuplicate) return;
  if (!result.text && !result.extraMessages?.length) return;
  try {
    if (result.text) {
      await ctx.telegram.sendMessage(
        result.replyMarkup
          ? { text: result.text, reply_markup: result.replyMarkup }
          : result.text,
      );
    }
    for (const extra of result.extraMessages ?? []) {
      await ctx.telegram.sendMessage(
        extra.replyMarkup
          ? { text: extra.text, reply_markup: extra.replyMarkup }
          : extra.text,
      );
    }
  } catch (err) {
    console.warn(
      "[telegram] failed to send bot reply:",
      err instanceof Error ? err.message : err,
    );
  }
}

export default telegramChannel({
  botUsername: botUsername || undefined,
  uploadPolicy: {
    allowedMediaTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/csv",
      "text/plain",
      "application/octet-stream",
      "image/*",
    ],
    maxBytes: 10 * 1024 * 1024,
  },
  async onMessage(ctx, message) {
    if (message.from?.isBot || message.chat.type === "channel") {
      return null;
    }
    if (message.chat.type !== "private") {
      return null;
    }
    const inbound = inboundFromMessage(message);
    if (!inbound) return null;
    if (!inbound.text && inbound.attachments.length === 0) {
      return null;
    }

    let result: TelegramBotReply;
    try {
      result = await handleTelegramInbound(inbound, {
        configuredBot: botUsername,
      });
    } catch (err) {
      console.warn(
        "[telegram] handler failed:",
        err instanceof Error ? err.message : err,
      );
      await postReply(ctx, {
        text: "Something went wrong on my side. Send /start and I'll pick up where we left off.",
        routeToAgent: false,
        memberId: null,
      });
      return null;
    }

    if (result.skipDuplicate) return null;

    if (!result.routeToAgent) {
      await postReply(ctx, result);
      return null;
    }

    await ctx.telegram.startTyping();

    const from = message.from;
    if (!from) return null;

    const attributes: Record<string, string> = {
      chat_id: message.chat.id,
      chat_type: message.chat.type,
      message_id: message.messageId,
      user_id: from.id,
      memberId: result.memberId ?? "",
      conversationId: result.conversationId ?? "",
    };
    if (from.username !== undefined) {
      attributes.username = from.username;
    }
    if (message.messageThreadId !== undefined) {
      attributes.message_thread_id = String(message.messageThreadId);
    }

    const context: string[] = [];
    if (result.contextPrefix) context.push(result.contextPrefix);

    return {
      auth: {
        attributes,
        authenticator: "telegram-webhook",
        issuer: "telegram",
        principalId: `telegram:${from.id}`,
        principalType: "user",
        subject: from.id,
      },
      context: context.length > 0 ? context : undefined,
    };
  },

  async onCallbackQuery(ctx, query) {
    try {
      await ctx.telegram.answerCallbackQuery({ callbackQueryId: query.id });
    } catch (err) {
      console.warn(
        "[telegram] answerCallbackQuery failed:",
        err instanceof Error ? err.message : err,
      );
    }
    const inbound = inboundFromCallback(query);
    if (!inbound) return;
    try {
      const result = await handleTelegramInbound(inbound, {
        configuredBot: botUsername,
      });
      await postReply(ctx, result);
    } catch (err) {
      console.warn(
        "[telegram] callback handler failed:",
        err instanceof Error ? err.message : err,
      );
      await postReply(ctx, {
        text: "Something went wrong on that button. Try /opportunities.",
        routeToAgent: false,
        memberId: null,
      });
    }
  },

  events: {
    async "message.completed"(data, channel, sessionCtx) {
      if (data.finishReason === "tool-calls" || !data.message) return;

      const auth = sessionCtx.session.auth.current;
      const memberId =
        typeof auth?.attributes?.memberId === "string"
          ? auth.attributes.memberId
          : null;
      const conversationId =
        typeof auth?.attributes?.conversationId === "string"
          ? auth.attributes.conversationId
          : null;
      const inboundMessageId =
        typeof auth?.attributes?.message_id === "string"
          ? auth.attributes.message_id
          : null;

      if (memberId && conversationId) {
        try {
          await completeSurfaceTurn({
            memberId,
            conversationId,
            surface: "telegram",
            assistantBody: data.message,
            assistantIdempotencyKey: inboundMessageId
              ? `telegram:assistant:${inboundMessageId}`
              : `telegram:assistant:session:${sessionCtx.session.id}`,
            eveSessionId: sessionCtx.session.id,
            continuationTokenRef: channel.continuationToken,
          });
        } catch (err) {
          console.warn(
            "[telegram] completeSurfaceTurn failed:",
            err instanceof Error ? err.message : err,
          );
        }
      }

      await channel.telegram.post(data.message);
    },

    async "turn.completed"(_data, channel, sessionCtx) {
      const auth = sessionCtx.session.auth.current;
      const memberId =
        typeof auth?.attributes?.memberId === "string"
          ? auth.attributes.memberId
          : null;
      const conversationId =
        typeof auth?.attributes?.conversationId === "string"
          ? auth.attributes.conversationId
          : null;
      if (!memberId || !conversationId) return;

      try {
        await syncSurfaceSessionCursor({
          memberId,
          conversationId,
          surface: "telegram",
          eveSessionId: sessionCtx.session.id,
          continuationTokenRef: channel.continuationToken,
        });
      } catch (err) {
        console.warn(
          "[telegram] syncSurfaceSessionCursor failed:",
          err instanceof Error ? err.message : err,
        );
      }
    },
  },
});
