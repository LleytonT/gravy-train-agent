/**
 * Telegram talk-surface inbound routing (GS-011).
 *
 * The identity module upserts the member from a verified Telegram user ID.
 * This module is the adapter seam: a private update → member + conversation
 * + either a static reply or an Eve agent turn. Username-only linking stays
 * rejected. Group chats, other bots, and channel posts are ignored.
 */

import {
  beginSurfaceTurn,
  completeSurfaceTurn,
  getOrCreateActiveConversation,
} from "./conversation.js";
import {
  ChannelLinkError,
  consumeTelegramDeepLink,
  findMemberByTelegramUserId,
  touchTelegramIdentityUsername,
  upsertMemberFromTelegramLogin,
  type MemberRecord,
} from "./identity.js";
import {
  getMessagingDestination,
  saveMessagingDestination,
} from "./messaging.js";

/**
 * Phrases from the former website-first gate. Cold-start replies must never
 * match this: unknown private user IDs talk immediately.
 */
export const WEBSITE_GATE_REFUSAL_RE =
  /this telegram account is not linked yet|sign in on the web|open the one-time link from your signed-in gravy scout account on the web/i;

export function isWebsiteGateRefusal(text: string): boolean {
  return WEBSITE_GATE_REFUSAL_RE.test(text);
}

export type TelegramInboundUser = {
  id: string;
  isBot?: boolean;
  username?: string;
  firstName?: string;
  lastName?: string;
};

export type TelegramInboundMessage = {
  messageId: string;
  text?: string;
  caption?: string;
  attachments?: readonly unknown[];
  from?: TelegramInboundUser;
  chat: { id: string; type: string };
  messageThreadId?: number | string;
};

export type TelegramInboundAuth = {
  attributes: Record<string, string>;
  authenticator: "telegram-webhook";
  issuer: "telegram";
  principalId: string;
  principalType: "user";
  subject: string;
};

export type TelegramInboundResult =
  | { kind: "drop"; reason: "bot" | "channel" | "empty" | "no_sender" | "not_private" }
  | {
      kind: "drop";
      reason: "duplicate";
      memberId: string;
      conversationId: string;
    }
  | { kind: "static_reply"; text: string; memberId?: string }
  | {
      kind: "agent_turn";
      memberId: string;
      conversationId: string;
      auth: TelegramInboundAuth;
      context?: string[];
    };

const START_COMMAND =
  /^\/start(?:@([A-Za-z0-9_]+))?(?:\s+([A-Za-z0-9_-]+))?\s*$/u;

export function parseStartPayload(
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

const LINK_ERROR_HINTS: Record<string, string> = {
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

/**
 * Route one verified Telegram update. Callers (the Eve channel, smokes)
 * observe member creation, conversation append, and whether an agent turn
 * should run. Deep-link tokens remain for reconnect / dashboard lock only.
 */
export async function handleTelegramInbound(
  message: TelegramInboundMessage,
  options?: { botUsername?: string },
): Promise<TelegramInboundResult> {
  if (message.from?.isBot) {
    return { kind: "drop", reason: "bot" };
  }
  if (message.chat.type === "channel") {
    return { kind: "drop", reason: "channel" };
  }

  const text = (message.text || message.caption || "").trim();
  const hasAttachments = (message.attachments?.length ?? 0) > 0;
  if (!text && !hasAttachments) {
    return { kind: "drop", reason: "empty" };
  }

  const from = message.from;
  if (!from) return { kind: "drop", reason: "no_sender" };

  if (message.chat.type !== "private") {
    return { kind: "drop", reason: "not_private" };
  }

  const botUsername =
    options?.botUsername ??
    process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ??
    undefined;
  const start = parseStartPayload(text, botUsername);

  if (start.isStart && start.token && start.token !== "link") {
    return consumeStartToken({
      token: start.token,
      text,
      from,
      message,
    });
  }

  let member: MemberRecord;
  try {
    member = await ensureMemberFromTelegramUser(from);
  } catch (err) {
    console.warn(
      "[telegram] member provision failed:",
      err instanceof Error ? err.message : err,
    );
    return {
      kind: "static_reply",
      text: "Could not start your Gravy Scout account from this Telegram user. Try again in a moment.",
    };
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

  const conversation = await getOrCreateActiveConversation(
    member.id,
    start.isStart ? { title: "Gravy Scout" } : undefined,
  );
  const turn = await beginSurfaceTurn({
    memberId: member.id,
    conversationId: conversation.id,
    surface: "telegram",
    body: text || "[attachment]",
    idempotencyKey: `telegram:msg:${message.messageId}`,
    externalMessageId: message.messageId,
    titleFromBody: start.isStart ? false : undefined,
  });

  if (!turn.created) {
    return {
      kind: "drop",
      reason: "duplicate",
      memberId: member.id,
      conversationId: conversation.id,
    };
  }

  const attributes: Record<string, string> = {
    chat_id: String(message.chat.id),
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
    kind: "agent_turn",
    memberId: member.id,
    conversationId: conversation.id,
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
}

async function consumeStartToken(input: {
  token: string;
  text: string;
  from: TelegramInboundUser;
  message: TelegramInboundMessage;
}): Promise<TelegramInboundResult> {
  const { token, text, from, message } = input;
  try {
    const { kind, identity } = await consumeTelegramDeepLink({
      token,
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
    return {
      kind: "static_reply",
      memberId: identity.memberId,
      text:
        kind === "login"
          ? "You're signed in to Gravy Scout. Return to the browser tab to continue."
          : "Telegram linked to your Gravy Scout account. You can keep chatting here or on the web — same conversation.",
    };
  } catch (err) {
    if (err instanceof ChannelLinkError) {
      return {
        kind: "static_reply",
        text:
          LINK_ERROR_HINTS[err.code] ??
          "Could not complete that Telegram link. Generate a fresh one from the web app.",
      };
    }
    console.warn(
      "[telegram] link consume failed:",
      err instanceof Error ? err.message : err,
    );
    return {
      kind: "static_reply",
      text: "Something went wrong while linking. Try a fresh link from the web app, or just send a message here to continue.",
    };
  }
}
