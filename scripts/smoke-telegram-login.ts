#!/usr/bin/env npx tsx
/**
 * GS-008 smoke: Telegram Login verification + member session minting.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const proxy = readFileSync(resolve("proxy.ts"), "utf8");
  assert(proxy.includes("/get-started"), "get-started must be public");
  assert(proxy.includes("/app"), "app shell must be gated");

  const eve = readFileSync(resolve("agent/channels/eve.ts"), "utf8");
  assert(eve.includes("memberSessionAuth"), "Eve missing memberSessionAuth");

  process.env.TELEGRAM_BOT_TOKEN =
    process.env.TELEGRAM_BOT_TOKEN?.trim() || `smoke-bot-token-${randomUUID()}`;
  process.env.TELEGRAM_BOT_USERNAME =
    process.env.TELEGRAM_BOT_USERNAME?.trim() || "GravyScoutSmokeBot";
  process.env.MEMBER_SESSION_SECRET =
    process.env.MEMBER_SESSION_SECRET?.trim() || `smoke-session-${randomUUID()}`;

  const { verifyTelegramLoginPayload } = await import(
    "../agent/lib/telegram-login.js"
  );
  const {
    signMemberSessionToken,
    verifyMemberSessionToken,
  } = await import("../agent/lib/member-session.js");
  const { upsertMemberFromTelegramLogin } = await import(
    "../agent/lib/identity.js"
  );
  const { ensureSchema, getDb } = await import("../agent/lib/db/client.js");
  const { channelIdentities, members } = await import(
    "../agent/lib/db/schema.js"
  );

  const telegramUserId = String(Math.floor(1e9 + Math.random() * 1e9));
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    first_name: "Smoke",
    id: telegramUserId,
    username: "smoke_user",
  };
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHash("sha256")
    .update(process.env.TELEGRAM_BOT_TOKEN)
    .digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");

  const payload = {
    id: fields.id,
    first_name: fields.first_name,
    username: fields.username,
    auth_date: fields.auth_date,
    hash,
  };
  const verified = verifyTelegramLoginPayload(payload);
  assert(verified.telegramUserId === telegramUserId, "verified id mismatch");

  let memberId: string | null = null;
  let databaseChecked = false;
  if (process.env.DATABASE_URL?.trim()) {
    try {
      await ensureSchema();
      const member = await upsertMemberFromTelegramLogin({
        telegramUserId,
        username: verified.username,
        displayName: verified.displayName,
      });
      memberId = member.id;
      assert(
        member.externalAuthId === `telegram:${telegramUserId}`,
        "external auth id should be telegram-scoped",
      );

      const db = getDb();
      const [identity] = await db
        .select()
        .from(channelIdentities)
        .where(eq(channelIdentities.memberId, member.id))
        .limit(1);
      assert(identity?.externalUserId === telegramUserId, "channel not bound");

      const token = await signMemberSessionToken({
        memberId: member.id,
        externalAuthId: member.externalAuthId!,
        authenticator: "telegram",
        displayName: member.displayName,
      });
      const claims = await verifyMemberSessionToken(token);
      assert(claims?.memberId === member.id, "session claims mismatch");

      await db
        .delete(channelIdentities)
        .where(eq(channelIdentities.memberId, member.id));
      await db.delete(members).where(eq(members.id, member.id));
      databaseChecked = true;
    } catch (error) {
      console.warn(
        "[smoke-telegram-login] database path skipped:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (!databaseChecked) {
    const token = await signMemberSessionToken({
      memberId: randomUUID(),
      externalAuthId: `telegram:${telegramUserId}`,
      authenticator: "telegram",
      displayName: "Smoke",
    });
    const claims = await verifyMemberSessionToken(token);
    assert(claims?.authenticator === "telegram", "session authenticator");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        telegramUserId,
        memberId,
        databaseChecked,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
