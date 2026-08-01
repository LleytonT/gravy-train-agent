import { updateUserProfile, readUserProfile } from "./profile.js";

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

function parseSectionValue(
  markdown: string,
  section: string,
  key: string,
): string | null {
  const lines = markdown.split("\n");
  let inSection = false;
  const keyRe = new RegExp(`^[-*]\\s*${key}\\s*:\\s*(.*)$`, "i");

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+/.test(trimmed)) {
      inSection = new RegExp(`^##\\s+${section}\\s*$`, "i").test(trimmed);
      continue;
    }
    if (!inSection) continue;
    const match = trimmed.match(keyRe);
    if (match) {
      const value = match[1]!.trim();
      if (!value || value.startsWith("_(") || value === "unset") return null;
      return value;
    }
  }
  return null;
}

export function getMessagingDestination(
  markdown?: string,
): MessagingDestination {
  const profile = markdown ?? readUserProfile();
  const consentRaw = parseSectionValue(profile, "Messaging", "consentUpdates");
  const onboardingRaw = parseSectionValue(
    profile,
    "Messaging",
    "onboardingComplete",
  );

  const username = parseSectionValue(profile, "Messaging", "telegramUsername");

  return {
    telegramChatId: parseSectionValue(profile, "Messaging", "telegramChatId"),
    telegramUsername: username ? username.replace(/^@/, "") : null,
    linkedAt: parseSectionValue(profile, "Messaging", "linkedAt"),
    consentUpdates: consentRaw?.toLowerCase() === "true",
    onboardingComplete: onboardingRaw?.toLowerCase() === "true",
  };
}

export function formatMessagingSection(
  dest: MessagingDestination,
): string {
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

export function saveMessagingDestination(input: {
  telegramChatId?: string | null;
  telegramUsername?: string | null;
  consentUpdates?: boolean;
  onboardingComplete?: boolean;
  markLinked?: boolean;
}): MessagingDestination {
  const current = getMessagingDestination();
  const next: MessagingDestination = {
    telegramChatId:
      input.telegramChatId !== undefined
        ? input.telegramChatId
        : current.telegramChatId,
    telegramUsername:
      input.telegramUsername !== undefined
        ? input.telegramUsername?.replace(/^@/, "") ?? null
        : current.telegramUsername,
    linkedAt:
      input.markLinked ||
      (input.telegramChatId && input.telegramChatId !== current.telegramChatId)
        ? new Date().toISOString()
        : current.linkedAt,
    consentUpdates:
      input.consentUpdates !== undefined
        ? input.consentUpdates
        : current.consentUpdates,
    onboardingComplete:
      input.onboardingComplete !== undefined
        ? input.onboardingComplete
        : current.onboardingComplete,
  };

  updateUserProfile({
    replaceSection: {
      heading: "Messaging",
      content: formatMessagingSection(next),
    },
  });

  return next;
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
