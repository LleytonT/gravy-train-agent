import { telegramChannel } from "eve/channels/telegram";

import {
  completeSurfaceTurn,
  syncSurfaceSessionCursor,
} from "../lib/conversation.js";
import { handleTelegramInbound } from "../lib/telegram-inbound.js";

/**
 * Telegram bot channel — primary chat surface and identity proof.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET_TOKEN  (must match setWebhook secret_token)
 *   TELEGRAM_BOT_USERNAME          (without @)
 *
 * Webhook: POST /eve/v1/telegram
 *
 * A verified Telegram user ID creates or resolves the member on first
 * private message. Username-only linking is not supported. Deep-link
 * tokens remain for web Login Widget fallback and reconnect. Inbound and
 * outbound turns go through the canonical conversation bridge.
 */

const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");

async function replyAndDrop(
  ctx: { telegram: { sendMessage: (text: string) => Promise<unknown> } },
  text: string,
): Promise<null> {
  try {
    await ctx.telegram.sendMessage(text);
  } catch (err) {
    console.warn(
      "[telegram] failed to send link reply:",
      err instanceof Error ? err.message : err,
    );
  }
  return null;
}

export default telegramChannel({
  botUsername: botUsername || undefined,
  async onMessage(ctx, message) {
    const result = await handleTelegramInbound(message, {
      botUsername: botUsername || undefined,
    });

    if (result.kind === "drop") {
      return null;
    }
    if (result.kind === "static_reply") {
      return replyAndDrop(ctx, result.text);
    }

    await ctx.telegram.startTyping();
    return {
      auth: result.auth,
      context: result.context,
    };
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
