/**
 * Telegram Login Widget verification + Login Widget domain probe.
 * @see https://core.telegram.org/widgets/login-legacy
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

export type TelegramLoginDomainStatus = {
  /** Hostname Telegram should accept for the legacy Login Widget (no protocol). */
  domain: string | null;
  /** Full origin used when probing oauth.telegram.org/embed. */
  origin: string | null;
  /** False when Telegram returns "Bot domain invalid" for the configured origin. */
  widgetDomainValid: boolean | null;
  detail: string | null;
};

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
const DEFAULT_PRODUCTION_LOGIN_HOST = "gravy.sh";

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

function hostnameFromUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const host = url.hostname.trim().toLowerCase();
    return host || null;
  } catch {
    const host = value
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      ?.split(":")[0]
      ?.trim()
      .toLowerCase();
    return host || null;
  }
}

/**
 * Prefer an explicit login domain, then public app URLs, then the production
 * gravy.sh host. Returns hostname only (BotFather `/setdomain` format).
 */
export function resolveTelegramLoginDomain(): string | null {
  const configured =
    hostnameFromUrl(process.env.TELEGRAM_LOGIN_DOMAIN) ||
    hostnameFromUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    hostnameFromUrl(process.env.PUBLIC_BASE_URL) ||
    hostnameFromUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    hostnameFromUrl(
      process.env.VERCEL_ENV === "production" ? process.env.VERCEL_URL : null,
    );
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return DEFAULT_PRODUCTION_LOGIN_HOST;
  return "localhost";
}

export function resolveTelegramLoginOrigin(
  domain = resolveTelegramLoginDomain(),
): string | null {
  if (!domain) return null;
  if (domain === "localhost" || domain.endsWith(".localhost")) {
    return `http://${domain}:3000`;
  }
  return `https://${domain}`;
}

/**
 * Ask Telegram whether the Login Widget domain is registered for this bot.
 * A missing BotFather `/setdomain` (or Allowed URL) returns "Bot domain invalid".
 */
export async function probeTelegramLoginDomain(input?: {
  botUsername?: string | null;
  origin?: string | null;
}): Promise<TelegramLoginDomainStatus> {
  const botUsername =
    (input?.botUsername ?? process.env.TELEGRAM_BOT_USERNAME)
      ?.replace(/^@/, "")
      .trim() || null;
  const domain = resolveTelegramLoginDomain();
  const origin = input?.origin ?? resolveTelegramLoginOrigin(domain);

  if (!botUsername || !origin || !domain) {
    return {
      domain,
      origin,
      widgetDomainValid: null,
      detail: "Telegram Login is not fully configured",
    };
  }

  try {
    const url = new URL(
      `https://oauth.telegram.org/embed/${encodeURIComponent(botUsername)}`,
    );
    url.searchParams.set("origin", origin);
    url.searchParams.set("size", "large");
    url.searchParams.set("request_access", "write");

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const body = (await response.text()).trim();
    const invalid =
      /bot domain invalid/i.test(body) ||
      (body.length < 80 && /invalid/i.test(body));

    if (invalid) {
      return {
        domain,
        origin,
        widgetDomainValid: false,
        detail: `BotFather Login Widget domain is not set to "${domain}". Run /setdomain for @${botUsername} (hostname only, no https://).`,
      };
    }

    return {
      domain,
      origin,
      widgetDomainValid: true,
      detail: null,
    };
  } catch (error) {
    return {
      domain,
      origin,
      widgetDomainValid: null,
      detail:
        error instanceof Error
          ? `Could not probe Telegram Login domain: ${error.message}`
          : "Could not probe Telegram Login domain",
    };
  }
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
