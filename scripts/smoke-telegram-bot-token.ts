#!/usr/bin/env npx tsx
/**
 * Diagnose Telegram Bot API 404s without requiring a real bot token.
 */
import {
  diagnoseTelegramBotApiFailure,
  inspectTelegramBotToken,
  normalizeTelegramBotToken,
} from "../agent/lib/telegram-bot-token.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const missing = inspectTelegramBotToken(undefined);
  assert(!missing.present && !missing.looksLikeToken, "unset should be absent");
  assert(
    missing.issues.some((issue) => issue.includes("404")),
    `unset issues should mention 404, got ${missing.issues.join(" | ")}`,
  );

  const empty = inspectTelegramBotToken("");
  assert(!empty.present, "empty string should be absent");

  const username = inspectTelegramBotToken("GravyScoutBot");
  assert(username.present && !username.looksLikeToken, "username is not a token");
  assert(
    username.issues.some((issue) => issue.toLowerCase().includes("username")),
    "username issue missing",
  );

  const quoted = inspectTelegramBotToken('"123456:AAHsecretsecretsecretsecret"');
  assert(quoted.looksLikeToken, "quoted valid token should parse after strip");
  assert(
    quoted.issues.some((issue) => issue.toLowerCase().includes("quote")),
    "quoted token should warn",
  );
  const normalizedQuoted = normalizeTelegramBotToken(
    '"123456:AAHsecretsecretsecretsecret"',
  );
  assert(
    normalizedQuoted.token === "123456:AAHsecretsecretsecretsecret",
    "normalize should strip quotes",
  );

  const prefixed = inspectTelegramBotToken("bot123456:AAHsecretsecretsecretsecret");
  assert(
    prefixed.issues.some((issue) => issue.includes("bot")),
    "bot prefix should warn",
  );

  const ok = inspectTelegramBotToken("8816986703:AAHsecretsecretsecretsecret");
  assert(ok.looksLikeToken && ok.botId === "8816986703", "valid token bot id");
  assert(ok.issues.length === 0, `valid token had issues: ${ok.issues.join(" | ")}`);

  const emptyUrl = await fetch("https://api.telegram.org/bot/getWebhookInfo");
  const emptyBody = (await emptyUrl.json()) as {
    ok?: boolean;
    error_code?: number;
    description?: string;
  };
  assert(emptyUrl.status === 404, `empty token URL status ${emptyUrl.status}`);
  assert(emptyBody.error_code === 404, "empty token body error_code");
  assert(emptyBody.description === "Not Found", "empty token description");

  const garbage = await fetch(
    "https://api.telegram.org/botnot-a-real-token/getWebhookInfo",
  );
  const garbageBody = (await garbage.json()) as { error_code?: number };
  assert(garbage.status === 404, "garbage token should 404, not 401");
  assert(garbageBody.error_code === 404, "garbage error_code");

  const malformedButParsed = await fetch(
    "https://api.telegram.org/bot123:abc/getWebhookInfo",
  );
  assert(
    malformedButParsed.status === 401,
    `parseable-but-wrong token should 401, got ${malformedButParsed.status}`,
  );

  const advice = diagnoseTelegramBotApiFailure({
    httpStatus: 404,
    description: "Not Found",
    token: missing,
  });
  assert(advice.includes("missing bot token"), advice);

  console.log("ok: Telegram 404 maps to an empty/malformed bot token, not a missing webhook");
}

await main();
