/**
 * Diagnose Telegram Bot API tokens without logging the secret.
 *
 * Telegram returns HTTP 404 "Not Found" when the URL does not contain a
 * parseable `bot<id>:<secret>` path — most often because `$TELEGRAM_BOT_TOKEN`
 * is empty in the shell, so `https://api.telegram.org/bot$TOKEN/getWebhookInfo`
 * becomes `https://api.telegram.org/bot/getWebhookInfo`.
 *
 * A well-formed but wrong/revoked token returns 401 Unauthorized instead.
 */

export const TELEGRAM_BOT_TOKEN_PATTERN = /^(\d+):[A-Za-z0-9_-]+$/;

export type TelegramBotTokenInspection = {
  present: boolean;
  looksLikeToken: boolean;
  /** Numeric bot id (the part before `:`, not secret). */
  botId: string | null;
  length: number;
  issues: string[];
};

export function normalizeTelegramBotToken(
  raw: string | undefined | null,
): { token: string | null; inspection: TelegramBotTokenInspection } {
  const inspection = inspectTelegramBotToken(raw);
  if (!inspection.looksLikeToken) {
    return { token: null, inspection };
  }
  let value = raw ?? "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  value = value.trim();
  if (value.toLowerCase().startsWith("bearer ")) {
    value = value.slice("bearer ".length).trim();
  }
  return { token: value, inspection };
}

export function inspectTelegramBotToken(
  raw: string | undefined | null,
): TelegramBotTokenInspection {
  const issues: string[] = [];
  if (raw === undefined || raw === null) {
    return {
      present: false,
      looksLikeToken: false,
      botId: null,
      length: 0,
      issues: [
        "TELEGRAM_BOT_TOKEN is unset. Shell curl interpolates an empty value, so the request hits https://api.telegram.org/bot/getWebhookInfo and Telegram returns 404 Not Found.",
      ],
    };
  }

  const length = raw.length;
  if (raw.length === 0) {
    issues.push(
      "TELEGRAM_BOT_TOKEN is empty. Same 404 as an unset variable.",
    );
    return {
      present: false,
      looksLikeToken: false,
      botId: null,
      length,
      issues,
    };
  }

  let value = raw;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    issues.push(
      "Token is wrapped in quotes. Remove them from .env / the shell export.",
    );
    value = value.slice(1, -1);
  }

  if (/^\s|\s$/.test(value) || value.includes("\n") || value.includes("\r")) {
    issues.push("Token has leading/trailing whitespace or a newline.");
    value = value.trim();
  }

  if (value.toLowerCase().startsWith("bot")) {
    issues.push(
      "Token starts with 'bot'. The API path already includes /bot — paste only the BotFather token (`123456:AAH…`).",
    );
  }

  if (value.toLowerCase().startsWith("bearer ")) {
    issues.push("Token has a Bearer prefix. Use the raw BotFather token.");
    value = value.slice("bearer ".length).trim();
  }

  if (!value.includes(":")) {
    issues.push(
      "Token has no colon. This looks like a bot username, not a BotFather token.",
    );
  }

  const match = TELEGRAM_BOT_TOKEN_PATTERN.exec(value);
  const looksLikeToken = Boolean(match);
  if (!looksLikeToken && issues.length === 0) {
    issues.push(
      "Token does not match botId:secret (digits, colon, then letters/digits/_/-).",
    );
  }

  return {
    present: true,
    looksLikeToken,
    botId: match?.[1] ?? null,
    length,
    issues,
  };
}

export function diagnoseTelegramBotApiFailure(input: {
  httpStatus: number;
  description?: string | null;
  token: TelegramBotTokenInspection;
}): string {
  const desc = input.description?.trim() || "unknown";
  if (input.httpStatus === 404) {
    if (!input.token.present) {
      return "404 Not Found is Telegram's response for a missing bot token in the URL, not a missing webhook. Export TELEGRAM_BOT_TOKEN (or put it in .env / .env.local) and rerun. Prefer `pnpm check:telegram` so the token is read from dotenv instead of the shell.";
    }
    if (!input.token.looksLikeToken) {
      return `404 Not Found: Telegram did not parse a bot token in the path (${desc}). Paste the BotFather HTTP API token, not the @username, and do not prefix it with "bot".`;
    }
    return `404 Not Found from Telegram (${desc}). Confirm the method name is getWebhookInfo / setWebhook and that the token was not truncated.`;
  }
  if (input.httpStatus === 401) {
    return "401 Unauthorized: the token looks like a bot token but Telegram rejected it. It is wrong, revoked, or belongs to a different bot than TELEGRAM_BOT_USERNAME. Issue a new token with BotFather /token and update Vercel + local env.";
  }
  return `Telegram Bot API error ${input.httpStatus} (${desc}).`;
}

export type TelegramBotApiResult<T> = {
  httpStatus: number;
  ok: boolean;
  description?: string;
  result?: T;
};

export async function telegramBotApi<T>(
  token: string,
  method: string,
  init?: RequestInit,
): Promise<TelegramBotApiResult<T>> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, init);
  const body = (await response.json()) as {
    ok?: boolean;
    description?: string;
    result?: T;
  };
  return {
    httpStatus: response.status,
    ok: Boolean(body.ok),
    description: body.description,
    result: body.result,
  };
}
