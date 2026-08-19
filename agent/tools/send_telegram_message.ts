import { defineTool } from "eve/tools";
import { z } from "zod";

import { recordDelivery } from "../lib/delivery.js";
import { requireMemberCaller } from "../lib/identity.js";
import {
  sendProactiveTelegramMessage,
  TELEGRAM_SKIP_MESSAGES,
} from "../lib/telegram-send.js";

/**
 * Proactive Telegram delivery via Bot API sendMessage.
 * Prefer this for nightly digests when the member has linked Telegram.
 * Requires an active channel identity + consent; respects quiet hours.
 */
export default defineTool({
  description:
    "Send a Telegram message to the linked member. Use for nightly digests and setup confirmations when Telegram is linked. No-ops cleanly if unlinked, revoked, in quiet hours, or bot token missing.",
  inputSchema: z.object({
    body: z.string().min(1).max(4000),
    chatId: z
      .string()
      .optional()
      .describe("Override chat id; defaults to profile telegramChatId"),
    idempotencyKey: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "Stable key for delivery status; retries with the same key do not double-send status rows",
      ),
  }),
  async execute({ body, chatId, idempotencyKey }, ctx) {
    const { memberId } = requireMemberCaller(ctx);
    const deliveryKey =
      idempotencyKey ??
      `telegram:proactive:${memberId}:${createHashSlice(body)}`;

    const result = await sendProactiveTelegramMessage({
      memberId,
      body,
      chatId,
    });

    if (result.status === "skipped") {
      await recordDelivery({
        memberId,
        channel: "telegram",
        idempotencyKey: deliveryKey,
        status: "skipped",
        error: result.reason,
      });
      return {
        sent: false,
        skipped: true,
        reason: TELEGRAM_SKIP_MESSAGES[result.reason],
      };
    }

    if (result.status === "failed") {
      await recordDelivery({
        memberId,
        channel: "telegram",
        idempotencyKey: deliveryKey,
        status: "failed",
        error: result.error,
      });
      return {
        sent: false,
        error: result.error,
      };
    }

    await recordDelivery({
      memberId,
      channel: "telegram",
      idempotencyKey: deliveryKey,
      status: "sent",
      providerMessageId: result.providerMessageId,
    });

    return {
      sent: true,
      messageId: result.providerMessageId
        ? Number(result.providerMessageId)
        : undefined,
      chatId: result.chatId,
      deliveryKey,
    };
  },
});

function createHashSlice(body: string): string {
  let hash = 0;
  for (let i = 0; i < body.length; i += 1) {
    hash = (hash * 31 + body.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}
