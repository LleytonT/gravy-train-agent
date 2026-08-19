/**
 * Proactive Telegram send path.
 *
 * Discovery digests and the `send_telegram_message` tool share this seam.
 * Deterministic guards (identity, consent, quiet hours) live here; callers
 * record delivery rows and conversation messages themselves.
 */

import { getTelegramIdentityForMember } from "./identity.js";
import {
  getMessagingDestination,
  isTelegramConfigured,
  isWithinQuietHours,
} from "./messaging.js";

export type TelegramSkipReason =
  | "bot_not_configured"
  | "no_active_telegram_identity"
  | "no_telegram_chat_id"
  | "consent_updates_false"
  | "quiet_hours";

export type TelegramSendResult =
  | {
      status: "sent";
      chatId: string;
      providerMessageId: string | null;
    }
  | { status: "skipped"; reason: TelegramSkipReason }
  | { status: "failed"; error: string };

export type TelegramBotTransport = {
  sendMessage(input: {
    token: string;
    chatId: string;
    text: string;
  }): Promise<
    { ok: true; messageId: string | null } | { ok: false; error: string }
  >;
};

export const TELEGRAM_SKIP_MESSAGES: Record<TelegramSkipReason, string> = {
  bot_not_configured:
    "Telegram bot not configured (need TELEGRAM_BOT_TOKEN + TELEGRAM_BOT_USERNAME). Return digest as final message instead.",
  no_active_telegram_identity:
    "No active Telegram link. Ask the member to open the one-time deep link from the signed-in web app and tap Start.",
  no_telegram_chat_id:
    "Telegram is linked but chat id is missing. Ask the member to send any message to the bot once.",
  consent_updates_false:
    "Member has not consented to Telegram updates (consentUpdates=false). Confirm consent before sending digests.",
  quiet_hours:
    "Member is in quiet hours. Defer proactive Telegram delivery until the quiet window ends.",
};

export const defaultTelegramBotTransport: TelegramBotTransport = {
  async sendMessage({ token, chatId, text }) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "telegram_network_error",
      };
    }

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    };
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        error: json.description ?? `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      messageId:
        json.result?.message_id !== undefined
          ? String(json.result.message_id)
          : null,
    };
  },
};

/**
 * Attempt a proactive Telegram send for a member.
 *
 * `chatId` override skips quiet hours and consent (explicit tool send) but
 * still requires an active channel identity.
 */
export async function sendProactiveTelegramMessage(input: {
  memberId: string;
  body: string;
  chatId?: string;
  now?: Date;
  transport?: TelegramBotTransport;
}): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !isTelegramConfigured()) {
    return { status: "skipped", reason: "bot_not_configured" };
  }

  const dest = await getMessagingDestination(input.memberId);
  const identity = await getTelegramIdentityForMember(input.memberId);
  if (!identity) {
    return { status: "skipped", reason: "no_active_telegram_identity" };
  }

  const recipient =
    input.chatId ?? dest.telegramChatId ?? identity.externalUserId;
  if (!recipient) {
    return { status: "skipped", reason: "no_telegram_chat_id" };
  }

  if (!input.chatId && !dest.consentUpdates) {
    return { status: "skipped", reason: "consent_updates_false" };
  }

  if (!input.chatId && isWithinQuietHours(dest.quietHours, input.now)) {
    return { status: "skipped", reason: "quiet_hours" };
  }

  const transport = input.transport ?? defaultTelegramBotTransport;
  const sent = await transport.sendMessage({
    token,
    chatId: recipient,
    text: input.body,
  });
  if (!sent.ok) {
    return { status: "failed", error: sent.error };
  }
  return {
    status: "sent",
    chatId: recipient,
    providerMessageId: sent.messageId,
  };
}
