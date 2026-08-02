/**
 * Messaging destination helpers.
 * Authoritative storage lives on the member career profile document.
 * Channel identity (Telegram user ID) lives in the identity module — never
 * treat username as a durable link.
 */

import {
  getMemberContextSnapshot,
  saveMessagingForMember,
} from "./career-profile.js";

export type QuietHours = {
  start: string | null;
  end: string | null;
  timezone: string | null;
};

export type MessagingDestination = {
  telegramChatId: string | null;
  telegramUsername: string | null;
  linkedAt: string | null;
  consentUpdates: boolean;
  onboardingComplete: boolean;
  quietHours: QuietHours;
};

const EMPTY_QUIET_HOURS: QuietHours = {
  start: null,
  end: null,
  timezone: null,
};

const EMPTY: MessagingDestination = {
  telegramChatId: null,
  telegramUsername: null,
  linkedAt: null,
  consentUpdates: false,
  onboardingComplete: false,
  quietHours: { ...EMPTY_QUIET_HOURS },
};

function normalizeQuietHours(
  value: QuietHours | Partial<QuietHours> | null | undefined,
): QuietHours {
  if (!value) return { ...EMPTY_QUIET_HOURS };
  return {
    start: value.start?.trim() || null,
    end: value.end?.trim() || null,
    timezone: value.timezone?.trim() || null,
  };
}

export async function getMessagingDestination(
  memberId: string,
): Promise<MessagingDestination> {
  const snapshot = await getMemberContextSnapshot(memberId);
  const messaging = snapshot.document.messaging;
  if (!messaging) return { ...EMPTY, quietHours: { ...EMPTY_QUIET_HOURS } };
  return {
    ...EMPTY,
    ...messaging,
    quietHours: normalizeQuietHours(messaging.quietHours),
  };
}

export function formatMessagingSection(dest: MessagingDestination): string {
  const quiet = dest.quietHours ?? EMPTY_QUIET_HOURS;
  return [
    `- telegramChatId: ${dest.telegramChatId ?? ""}`,
    `- telegramUsername: ${dest.telegramUsername ? `@${dest.telegramUsername.replace(/^@/, "")}` : ""}`,
    `- linkedAt: ${dest.linkedAt ?? ""}`,
    `- consentUpdates: ${dest.consentUpdates ? "true" : "false"}`,
    `- onboardingComplete: ${dest.onboardingComplete ? "true" : "false"}`,
    `- quietHours: ${quiet.start ?? ""}–${quiet.end ?? ""} ${quiet.timezone ?? ""}`.trimEnd(),
    ``,
    `I'll use Telegram to send nightly opportunity updates when linked via a one-time web deep link. Reply anytime to chat.`,
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
    quietHours?: QuietHours | Partial<QuietHours> | null;
  },
): Promise<MessagingDestination> {
  return saveMessagingForMember(memberId, input);
}

/** Public bot username deep-link without a member-bound token (not for linking). */
export function telegramBotInfoLink(): string | null {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username) return null;
  return `https://t.me/${username}`;
}

/**
 * @deprecated Prefer createTelegramLinkToken() — static `?start=link` is not a
 * secure member-bound token. Kept as a no-token bot URL for display only.
 */
export function telegramDeepLink(): string | null {
  return telegramBotInfoLink();
}

export function isTelegramConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME,
  );
}

/**
 * True when `now` falls inside the member's quiet-hours window.
 * Missing start/end means quiet hours are not configured.
 */
export function isWithinQuietHours(
  quietHours: QuietHours | null | undefined,
  now = new Date(),
): boolean {
  const start = quietHours?.start?.trim();
  const end = quietHours?.end?.trim();
  if (!start || !end) return false;

  const timezone = quietHours?.timezone?.trim() || "UTC";
  let hhmm: string;
  try {
    hhmm = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
  } catch {
    hhmm = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
  }

  const current = toMinutes(hhmm);
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (current === null || startMin === null || endMin === null) return false;

  if (startMin === endMin) return true;
  if (startMin < endMin) {
    return current >= startMin && current < endMin;
  }
  // Window crosses midnight (e.g. 22:00–07:00).
  return current >= startMin || current < endMin;
}

function toMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

/** Exported for tests / empty baseline */
export const emptyMessagingDestination = EMPTY;
