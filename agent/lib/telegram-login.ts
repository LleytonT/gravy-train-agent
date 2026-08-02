/**
 * Telegram Login Widget verification.
 * @see https://core.telegram.org/widgets/login
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type TelegramLoginPayload = {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
};

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

export class TelegramLoginError extends Error {
  readonly code: "misconfigured" | "invalid" | "expired";
  readonly status: number;

  constructor(
    code: "misconfigured" | "invalid" | "expired",
    message: string,
    status = 401,
  ) {
    super(message);
    this.name = "TelegramLoginError";
    this.code = code;
    this.status = status;
  }
}

function botToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token || null;
}

export function isTelegramLoginConfigured(): boolean {
  return Boolean(botToken() && process.env.TELEGRAM_BOT_USERNAME?.trim());
}

export function verifyTelegramLoginPayload(
  payload: TelegramLoginPayload,
): {
  telegramUserId: string;
  username: string | null;
  displayName: string | null;
  photoUrl: string | null;
  authDate: number;
} {
  const token = botToken();
  if (!token) {
    throw new TelegramLoginError(
      "misconfigured",
      "TELEGRAM_BOT_TOKEN is not configured",
      503,
    );
  }

  const hash = typeof payload.hash === "string" ? payload.hash.trim() : "";
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw new TelegramLoginError("invalid", "Telegram login hash is invalid");
  }

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "hash" || value === undefined || value === null) continue;
    fields[key] = String(value);
  }

  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");

  const secret = createHash("sha256").update(token).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(hash.toLowerCase(), "utf8");
  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    throw new TelegramLoginError("invalid", "Telegram login signature mismatch");
  }

  const authDate = Number(fields.auth_date);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new TelegramLoginError("invalid", "Telegram auth_date is invalid");
  }
  if (Date.now() / 1000 - authDate > MAX_AUTH_AGE_SECONDS) {
    throw new TelegramLoginError("expired", "Telegram login data has expired");
  }

  const telegramUserId = String(fields.id ?? "").trim();
  if (!telegramUserId || !/^\d+$/.test(telegramUserId)) {
    throw new TelegramLoginError("invalid", "Telegram user id is invalid");
  }

  const first = fields.first_name?.trim() || "";
  const last = fields.last_name?.trim() || "";
  const displayName = [first, last].filter(Boolean).join(" ") || null;
  const username = fields.username?.replace(/^@/, "").trim() || null;
  const photoUrl = fields.photo_url?.trim() || null;

  return { telegramUserId, username, displayName, photoUrl, authDate };
}
