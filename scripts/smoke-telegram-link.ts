#!/usr/bin/env npx tsx
/**
 * GS-005 smoke checks for secure Telegram linking and sync.
 * Does not require a running Next server or live Telegram webhook.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

const { ensureSchema, getDb } = await import("../agent/lib/db/client.js");
const {
  beginSurfaceTurn,
  completeSurfaceTurn,
  getOrCreateActiveConversation,
  listMessages,
} = await import("../agent/lib/conversation.js");
const { recordDelivery } = await import("../agent/lib/delivery.js");
const {
  ChannelLinkError,
  consumeTelegramLinkToken,
  createTelegramLinkToken,
  findMemberByTelegramUserId,
  getTelegramIdentityForMember,
  revokeTelegramIdentity,
  touchTelegramIdentityUsername,
  upsertMemberFromExternalAuth,
} = await import("../agent/lib/identity.js");
const { isWithinQuietHours } = await import("../agent/lib/messaging.js");
const {
  channelIdentities,
  channelLinkTokens,
  digestDeliveries,
  members,
  messages,
} = await import("../agent/lib/db/schema.js");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectLinkError(
  code: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ChannelLinkError(${code})`);
  } catch (err) {
    assert(err instanceof ChannelLinkError, `expected ChannelLinkError, got ${err}`);
    assert(err.code === code, `expected code ${code}, got ${err.code}`);
  }
}

async function main() {
  const identitySource = readFileSync(resolve("agent/lib/identity.ts"), "utf8");
  assert(
    identitySource.includes("createTelegramLinkToken"),
    "identity module missing createTelegramLinkToken",
  );
  assert(
    identitySource.includes("consumeTelegramLinkToken"),
    "identity module missing consumeTelegramLinkToken",
  );
  assert(
    identitySource.includes("revokeTelegramIdentity"),
    "identity module missing revokeTelegramIdentity",
  );

  const telegramChannel = readFileSync(
    resolve("agent/channels/telegram.ts"),
    "utf8",
  );
  assert(
    telegramChannel.includes("consumeTelegramDeepLink"),
    "telegram channel must consume deep-link login/link tokens on /start",
  );
  assert(
    telegramChannel.includes("beginSurfaceTurn"),
    "telegram channel must route through conversation bridge",
  );
  assert(
    telegramChannel.includes("Username-only linking is not supported") ||
      telegramChannel.includes("usernames alone cannot link"),
    "telegram channel must reject username-only linking",
  );

  // Quiet-hours pure helper (no DB).
  assert(
    isWithinQuietHours(
      { start: "22:00", end: "07:00", timezone: "UTC" },
      new Date("2026-01-01T23:30:00.000Z"),
    ),
    "23:30 UTC should be inside 22:00-07:00 quiet hours",
  );
  assert(
    !isWithinQuietHours(
      { start: "22:00", end: "07:00", timezone: "UTC" },
      new Date("2026-01-01T12:00:00.000Z"),
    ),
    "12:00 UTC should be outside quiet hours",
  );

  await ensureSchema();
  const db = getDb();
  const runId = randomUUID();
  const memberIds: string[] = [];

  try {
    const memberA = await upsertMemberFromExternalAuth({
      externalAuthId: `clerk_tg_a_${runId}`,
      email: `tg-a-${runId}@example.invalid`,
      displayName: "Telegram A",
    });
    const memberB = await upsertMemberFromExternalAuth({
      externalAuthId: `clerk_tg_b_${runId}`,
      email: `tg-b-${runId}@example.invalid`,
      displayName: "Telegram B",
    });
    memberIds.push(memberA.id, memberB.id);

    const minted = await createTelegramLinkToken(memberA.id);
    assert(minted.token.length > 16, "token should be long enough");
    assert(minted.token.length <= 64, "token must fit Telegram start payload");
    assert(minted.expiresAt.getTime() > Date.now(), "token must be future-dated");

    const tokenHash = createHash("sha256")
      .update(minted.token, "utf8")
      .digest("hex");
    const [stored] = await db
      .select()
      .from(channelLinkTokens)
      .where(eq(channelLinkTokens.tokenHash, tokenHash))
      .limit(1);
    assert(stored, "token hash must be persisted");
    assert(!stored.consumedAt, "fresh token must be unconsumed");

    await expectLinkError("malformed", () =>
      consumeTelegramLinkToken({
        token: "!!bad!!",
        telegramUserId: "1001",
      }),
    );
    await expectLinkError("not_found", () =>
      consumeTelegramLinkToken({
        token: "a".repeat(32),
        telegramUserId: "1001",
      }),
    );
    await expectLinkError("malformed", () =>
      consumeTelegramLinkToken({
        token: minted.token,
        telegramUserId: "",
      }),
    );

    const telegramUserId = `tg_${runId}_1`;
    const linked = await consumeTelegramLinkToken({
      token: minted.token,
      telegramUserId,
      username: "ScoutHandle",
    });
    assert(linked.memberId === memberA.id, "link belongs to minting member");
    assert(linked.externalUserId === telegramUserId, "identity is Telegram user id");
    assert(linked.username === "ScoutHandle", "username is display metadata");

    await expectLinkError("used", () =>
      consumeTelegramLinkToken({
        token: minted.token,
        telegramUserId: `tg_${runId}_other`,
      }),
    );

    const resolved = await findMemberByTelegramUserId(telegramUserId);
    assert(resolved?.id === memberA.id, "resolve Telegram user → member");

    // Username change must not break identity.
    await touchTelegramIdentityUsername(telegramUserId, "NewHandle");
    const afterRename = await getTelegramIdentityForMember(memberA.id);
    assert(afterRename?.externalUserId === telegramUserId, "user id stable");
    assert(afterRename?.username === "NewHandle", "username updated");
    assert(
      (await findMemberByTelegramUserId(telegramUserId))?.id === memberA.id,
      "rename does not break lookup",
    );

    // Expired token.
    const expiredMint = await createTelegramLinkToken(memberA.id);
    const expiredHash = createHash("sha256")
      .update(expiredMint.token, "utf8")
      .digest("hex");
    await db
      .update(channelLinkTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(channelLinkTokens.tokenHash, expiredHash));
    await expectLinkError("expired", () =>
      consumeTelegramLinkToken({
        token: expiredMint.token,
        telegramUserId: `tg_${runId}_expired`,
      }),
    );

    // Conflict: same Telegram user cannot silently move to member B while active.
    const steal = await createTelegramLinkToken(memberB.id);
    await expectLinkError("conflict", () =>
      consumeTelegramLinkToken({
        token: steal.token,
        telegramUserId,
        username: "thief",
      }),
    );

    // Canonical conversation bridge for Telegram surface + webhook replay.
    const conversation = await getOrCreateActiveConversation(memberA.id);
    const inboundKey = `telegram:msg:smoke-${runId}`;
    const first = await beginSurfaceTurn({
      memberId: memberA.id,
      conversationId: conversation.id,
      surface: "telegram",
      body: "Any Decagon roles?",
      idempotencyKey: inboundKey,
      externalMessageId: `tg-msg-${runId}`,
    });
    assert(first.created, "first telegram inbound creates");
    const replay = await beginSurfaceTurn({
      memberId: memberA.id,
      conversationId: conversation.id,
      surface: "telegram",
      body: "Any Decagon roles?",
      idempotencyKey: inboundKey,
      externalMessageId: `tg-msg-${runId}`,
    });
    assert(!replay.created, "webhook replay must be idempotent");
    assert(replay.message.id === first.message.id, "same message row on replay");

    const web = await beginSurfaceTurn({
      memberId: memberA.id,
      conversationId: conversation.id,
      surface: "web",
      body: "Checking from web too",
      idempotencyKey: `web:msg:smoke-${runId}`,
    });
    assert(web.created, "web append on shared conversation");

    await completeSurfaceTurn({
      memberId: memberA.id,
      conversationId: conversation.id,
      surface: "telegram",
      assistantBody: "Here are a few Decagon seats that fit.",
      assistantIdempotencyKey: `telegram:assistant:smoke-${runId}`,
      eveSessionId: `ses_tg_${runId}`,
    });

    const timeline = await listMessages(memberA.id, conversation.id, {
      limit: 20,
    });
    assert(timeline.messages.length >= 3, "shared timeline has web+telegram rows");
    const surfaces = new Set(timeline.messages.map((m) => m.surface));
    assert(surfaces.has("telegram"), "telegram surface present");
    assert(surfaces.has("web"), "web surface present");

    // Delivery status + revocation stops proactive path.
    const deliveryKey = `telegram:proactive:smoke-${runId}`;
    const delivery = await recordDelivery({
      memberId: memberA.id,
      channel: "telegram",
      idempotencyKey: deliveryKey,
      status: "sent",
      providerMessageId: "99",
    });
    assert(delivery.created, "delivery row created");
    const deliveryReplay = await recordDelivery({
      memberId: memberA.id,
      channel: "telegram",
      idempotencyKey: deliveryKey,
      status: "sent",
      providerMessageId: "99",
    });
    assert(!deliveryReplay.created, "delivery idempotent");
    assert(deliveryReplay.id === delivery.id, "same delivery row");

    await revokeTelegramIdentity(memberA.id);
    assert(
      (await getTelegramIdentityForMember(memberA.id)) === null,
      "revoked identity no longer active",
    );
    assert(
      (await findMemberByTelegramUserId(telegramUserId)) === null,
      "revoked telegram user does not resolve",
    );

    // After revoke, member B may claim the Telegram user with a fresh token.
    const reclaim = await createTelegramLinkToken(memberB.id);
    const reclaimed = await consumeTelegramLinkToken({
      token: reclaim.token,
      telegramUserId,
      username: "MovedHandle",
    });
    assert(reclaimed.memberId === memberB.id, "explicit reclaim after revoke");

    console.log("smoke-telegram-link: ok");
  } finally {
    if (memberIds.length > 0) {
      await db.delete(messages).where(inArray(messages.memberId, memberIds));
      await db
        .delete(digestDeliveries)
        .where(inArray(digestDeliveries.memberId, memberIds));
      await db
        .delete(channelLinkTokens)
        .where(inArray(channelLinkTokens.memberId, memberIds));
      await db
        .delete(channelIdentities)
        .where(inArray(channelIdentities.memberId, memberIds));
      await db.delete(members).where(inArray(members.id, memberIds));
    }
  }
}

main().catch((err) => {
  console.error("smoke-telegram-link failed:", err);
  process.exit(1);
});
