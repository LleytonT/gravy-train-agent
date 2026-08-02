/**
 * Messaging destination helpers.
 * Authoritative storage lives on the member career profile document.
 */

import {
  getMemberContextSnapshot,
  saveMessagingForMember,
} from "./career-profile.js";

export type MessagingDestination = {
  telegramChatId: string | null;
  telegramUsername: string | null;
  linkedAt: string | null;
  consentUpdates: boolean;
  onboardingComplete: boolean;
};

const EMPTY: MessagingDestination = {
  telegramChatId: null,
  telegramUsername: null,
  linkedAt: null,
  consentUpdates: false,
  onboardingComplete: false,
};

export async function getMessagingDestination(
  memberId: string,
): Promise<MessagingDestination> {
  const snapshot = await getMemberContextSnapshot(memberId);
  return snapshot.document.messaging ?? { ...EMPTY };
}

export function formatMessagingSection(dest: MessagingDestination): string {
  return [
    `- telegramChatId: ${dest.telegramChatId ?? ""}`,
    `- telegramUsername: ${dest.telegramUsername ? `@${dest.telegramUsername.replace(/^@/, "")}` : ""}`,
    `- linkedAt: ${dest.linkedAt ?? ""}`,
    `- consentUpdates: ${dest.consentUpdates ? "true" : "false"}`,
    `- onboardingComplete: ${dest.onboardingComplete ? "true" : "false"}`,
    ``,
    `I'll use Telegram to send nightly opportunity updates when linked. Reply anytime to chat.`,
  ].join("\n");
}

export async function saveMessagingDestination(
  memberId: string,
  input: {
    telegramChatId?: string | null;
    telegramUsername?: string | null;
    consentUpdates?: boolean;
    onboardingComplete?: boolean;
    markLinked?: boolean;
  },
): Promise<MessagingDestination> {
  return saveMessagingForMember(memberId, input);
}

export function telegramDeepLink(): string | null {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username) return null;
  return `https://t.me/${username}?start=link`;
}

export function isTelegramConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME,
  );
}

/** Exported for tests / empty baseline */
export const emptyMessagingDestination = EMPTY;
