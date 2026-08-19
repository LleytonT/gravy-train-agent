import { telegramChannel } from "eve/channels/telegram";

import {
  beginSurfaceTurn,
  completeSurfaceTurn,
  getOrCreateActiveConversation,
  syncSurfaceSessionCursor,
} from "../lib/conversation.js";
import {
  ChannelLinkError,
  consumeTelegramDeepLink,
  findMemberByTelegramUserId,
  touchTelegramIdentityUsername,
  upsertMemberFromTelegramLogin,
  type MemberRecord,
} from "../lib/identity.js";
import {
  getMessagingDestination,
  saveMessagingDestination,
} from "../lib/messaging.js";

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

const START_COMMAND =
  /^\/start(?:@([A-Za-z0-9_]+))?(?:\s+([A-Za-z0-9_-]+))?\s*$/u;

function parseStartPayload(
  text: string,
  configuredBot?: string,
): { isStart: boolean; token: string | null } {
  const match = START_COMMAND.exec(text.trim());
  if (!match) return { isStart: false, token: null };
  const target = match[1];
  if (
    target &&
    configuredBot &&
    target.toLowerCase() !== configuredBot.toLowerCase()
  ) {
    return { isStart: false, token: null };
  }
  return { isStart: true, token: match[2] ?? null };
}

function telegramDisplayName(from: {
  firstName?: string;
  lastName?: string;
}): string | null {
  const displayName = [from.firstName, from.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return displayName || null;
}

/**
 * Telegram-first membership: the verified webhook user ID is enough.
 * Usernames are display metadata only.
 */
async function ensureMemberFromTelegramUser(from: {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}): Promise<MemberRecord> {
  const existing = await findMemberByTelegramUserId(from.id);
  if (existing) {
    await touchTelegramIdentityUsername(from.id, from.username);
    return existing;
  }
  return upsertMemberFromTelegramLogin({
    telegramUserId: from.id,
    username: from.username,
    displayName: telegramDisplayName(from),
  });
}

async function persistChatDestination(input: {
  memberId: string;
  chatId: string;
  username?: string | null;
  consentUpdates?: boolean;
}): Promise<void> {
  const existing = await getMessagingDestination(input.memberId);
  await saveMessagingDestination(input.memberId, {
    telegramChatId: input.chatId,
    telegramUsername: input.username ?? existing.telegramUsername,
    consentUpdates:
      input.consentUpdates !== undefined
        ? input.consentUpdates
        : existing.consentUpdates || true,
    markLinked: true,
  });
}

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
    // Drop bot messages / empty channel noise — mirror Eve defaults lightly.
    if (message.from?.isBot || message.chat.type === "channel") {
      return null;
    }
    const text = (message.text || message.caption).trim();
    if (!text && message.attachments.length === 0) {
      return null;
    }

    const from = message.from;
    if (!from) return null;

    // Group chats are out of scope for GS-005 linking.
    if (message.chat.type !== "private") {
      return null;
    }

    const start = parseStartPayload(text, botUsername);
    if (start.isStart && start.token && start.token !== "link") {
      try {
        const { kind, identity } = await consumeTelegramDeepLink({
          token: start.token,
          telegramUserId: from.id,
          username: from.username,
          displayName: telegramDisplayName(from),
        });
        await persistChatDestination({
          memberId: identity.memberId,
          chatId: String(message.chat.id),
          username: from.username,
          consentUpdates: true,
        });
        // Record the link/login confirmation on the canonical timeline.
        const conversation = await getOrCreateActiveConversation(
          identity.memberId,
          { title: kind === "login" ? "Telegram login" : "Telegram link" },
        );
        await beginSurfaceTurn({
          memberId: identity.memberId,
          conversationId: conversation.id,
          surface: "telegram",
          body: text,
          idempotencyKey: `telegram:msg:${message.messageId}`,
          externalMessageId: message.messageId,
          titleFromBody: false,
        });
        const assistantBody =
          kind === "login"
            ? "You're signed in. Return to the browser to continue — web and Telegram share the same conversation."
            : "Telegram linked. You can keep chatting here or on the web — same conversation.";
        await completeSurfaceTurn({
          memberId: identity.memberId,
          conversationId: conversation.id,
          surface: "telegram",
          assistantBody,
          assistantIdempotencyKey: `telegram:${kind}:${message.messageId}`,
          eveSessionId: `telegram-${kind}:${message.messageId}`,
        });
        return replyAndDrop(
          ctx,
          kind === "login"
            ? "You're signed in to Gravy Scout. Return to the browser tab to continue."
            : "Telegram linked to your Gravy Scout account. You can keep chatting here or on the web — same conversation.",
        );
      } catch (err) {
        if (err instanceof ChannelLinkError) {
          const hints: Record<string, string> = {
            malformed:
              "That link looks invalid. Open Gravy Scout on the web and generate a fresh Telegram link.",
            not_found:
              "That link was not recognized. Open Gravy Scout on the web and generate a fresh Telegram link.",
            expired:
              "That link has expired. Open Gravy Scout on the web and generate a fresh Telegram link.",
            used: "That link was already used. Open Gravy Scout on the web and generate a fresh Telegram link.",
            conflict:
              "This Telegram account is already linked to a different Gravy Scout member. Disconnect it there first, or continue as that member.",
          };
          return replyAndDrop(
            ctx,
            hints[err.code] ??
              "Could not complete that Telegram link. Generate a fresh one from the web app.",
          );
        }
        console.warn(
          "[telegram] link consume failed:",
          err instanceof Error ? err.message : err,
        );
        return replyAndDrop(
          ctx,
          "Something went wrong while linking. Try a fresh link from the web app, or just send a message here to continue.",
        );
      }
    }

    let member: MemberRecord;
    try {
      member = await ensureMemberFromTelegramUser(from);
    } catch (err) {
      console.warn(
        "[telegram] member provision failed:",
        err instanceof Error ? err.message : err,
      );
      return replyAndDrop(
        ctx,
        "Could not start your Gravy Scout account from this Telegram user. Try again in a moment.",
      );
    }

    try {
      await persistChatDestination({
        memberId: member.id,
        chatId: String(message.chat.id),
        username: from.username,
      });
    } catch (err) {
      console.warn(
        "[telegram] failed to persist messaging destination:",
        err instanceof Error ? err.message : err,
      );
    }

    await ctx.telegram.startTyping();

    const conversation = await getOrCreateActiveConversation(member.id);
    const turn = await beginSurfaceTurn({
      memberId: member.id,
      conversationId: conversation.id,
      surface: "telegram",
      body: text || "[attachment]",
      idempotencyKey: `telegram:msg:${message.messageId}`,
      externalMessageId: message.messageId,
    });

    // Webhook retries with the same message id must not fork a second Eve turn.
    if (!turn.created) {
      return null;
    }

    const attributes: Record<string, string> = {
      chat_id: message.chat.id,
      chat_type: message.chat.type,
      message_id: message.messageId,
      user_id: from.id,
      memberId: member.id,
      conversationId: conversation.id,
    };
    if (from.username !== undefined) attributes.username = from.username;
    if (message.messageThreadId !== undefined) {
      attributes.message_thread_id = String(message.messageThreadId);
    }

    const context: string[] = [];
    if (turn.shouldInjectContext && turn.contextPrefix) {
      context.push(turn.contextPrefix);
    }

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
