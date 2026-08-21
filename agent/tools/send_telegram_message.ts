import { defineTool } from "eve/tools";
import { z } from "zod";

import { recordDelivery } from "../lib/delivery.js";
import {
  getTelegramIdentityForMember,
  requireMemberCaller,
} from "../lib/identity.js";
import {
  getMessagingDestination,
  isTelegramConfigured,
  isWithinQuietHours,
} from "../lib/messaging.js";

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
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const dest = await getMessagingDestination(memberId);
    const identity = await getTelegramIdentityForMember(memberId);
    const recipient = chatId ?? dest.telegramChatId;
    const deliveryKey =
      idempotencyKey ??
      `telegram:proactive:${memberId}:${createHashSlice(body)}`;

    if (!token || !isTelegramConfigured()) {
      await recordDelivery({
        memberId,
        channel: "telegram",
        idempotencyKey: deliveryKey,
        status: "skipped",
        error: "Telegram bot not configured",
      });
      return {
        sent: false,
        skipped: true,
        reason:
          "Telegram bot not configured (need TELEGRAM_BOT_TOKEN + TELEGRAM_BOT_USERNAME). Return digest as final message instead.",
      };
    }

    if (!identity) {
      await recordDelivery({
        memberId,
        channel: "telegram",
        idempotencyKey: deliveryKey,
        status: "skipped",
        error: "No active Telegram channel identity",
      });
      return {
        sent: false,
        skipped: true,
        reason:
          "No active Telegram channel identity. Ask the member to message the bot in a private chat.",
      };
    }

    if (!recipient) {
      await recordDelivery({
        memberId,
        channel: "telegram",
        idempotencyKey: deliveryKey,
        status: "skipped",
        error: "No telegramChatId",
      });
      return {
        sent: false,
        skipped: true,
        reason:
          "Telegram is linked but chat id is missing. Ask the member to send any message to the bot once.",
      };
    }

    if (!dest.consentUpdates && !chatId) {
      await recordDelivery({
        memberId,
        channel: "telegram",
        idempotencyKey: deliveryKey,
        status: "skipped",
        error: "consentUpdates=false",
      });
      return {
        sent: false,
        skipped: true,
        reason:
          "Member has not consented to Telegram updates (consentUpdates=false). Confirm consent before sending digests.",
      };
    }

    if (!chatId && isWithinQuietHours(dest.quietHours)) {
      await recordDelivery({
        memberId,
        channel: "telegram",
        idempotencyKey: deliveryKey,
        status: "skipped",
        error: "quiet hours",
      });
      return {
        sent: false,
        skipped: true,
        reason:
          "Member is in quiet hours. Defer proactive Telegram delivery until the quiet window ends.",
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
      const error = json.description ?? `HTTP ${res.status}`;
      await recordDelivery({
        memberId,
        channel: "telegram",
        idempotencyKey: deliveryKey,
        status: "failed",
        error,
      });
      return {
        sent: false,
        error,
      };
    }

    const providerMessageId =
      json.result?.message_id !== undefined
        ? String(json.result.message_id)
        : null;
    await recordDelivery({
      memberId,
      channel: "telegram",
      idempotencyKey: deliveryKey,
      status: "sent",
      providerMessageId,
    });

    return {
      sent: true,
      messageId: json.result?.message_id,
      chatId: recipient,
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
