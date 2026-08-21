#!/usr/bin/env npx tsx
/**
 * GS-011 smoke: unknown Telegram user IDs talk immediately.
 * Bare /start and a first DM create the member; group chats and webhook
 * retries do not. The old website-gate refusal cannot regress.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { inArray } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const FORBIDDEN_WEBSITE_GATE_SNIPPETS = [
  "This Telegram account is not linked yet. Sign in on the web",
  "To link Telegram, open the one-time link from your signed-in Gravy Scout account on the web",
];

function inboundMessage(input: {
  userId: string;
  text: string;
  messageId: string;
  chatType?: string;
  username?: string;
  firstName?: string;
  isBot?: boolean;
  attachments?: unknown[];
}) {
  return {
    messageId: input.messageId,
    text: input.text,
    caption: "",
    attachments: input.attachments ?? [],
    from: {
      id: input.userId,
      isBot: input.isBot ?? false,
      username: input.username,
      firstName: input.firstName ?? "Scout",
    },
    chat: {
      id: input.userId,
      type: input.chatType ?? "private",
    },
  };
}

async function main() {
  const inboundSource = readFileSync(
    resolve("agent/lib/telegram-inbound.ts"),
    "utf8",
  );
  const channelSource = readFileSync(
    resolve("agent/channels/telegram.ts"),
    "utf8",
  );
  const evalSource = readFileSync(
    resolve("evals/onboarding/telegram-cold-start.eval.ts"),
    "utf8",
  );

  assert(
    inboundSource.includes("handleTelegramInbound"),
    "inbound module missing handleTelegramInbound",
  );
  assert(
    inboundSource.includes("upsertMemberFromTelegramLogin"),
    "inbound module must create members via the identity module",
  );
  assert(
    channelSource.includes("handleTelegramInbound"),
    "telegram channel must call handleTelegramInbound",
  );
  assert(
    evalSource.includes("WEBSITE_GATE_REFUSAL") ||
      evalSource.includes("sign in on the web"),
    "eval must gate the website-gate refusal",
  );

  for (const snippet of FORBIDDEN_WEBSITE_GATE_SNIPPETS) {
    assert(
      !inboundSource.includes(snippet),
      `website-gate refusal leaked into telegram-inbound.ts: ${snippet}`,
    );
    assert(
      !channelSource.includes(snippet),
      `website-gate refusal leaked into telegram.ts: ${snippet}`,
    );
  }

  const {
    handleTelegramInbound,
    isWebsiteGateRefusal,
    parseStartPayload,
  } = await import("../agent/lib/telegram-inbound.js");

  const bareStart = parseStartPayload("/start");
  assert(bareStart.isStart && bareStart.token === null, "bare /start has no token");
  const startWithToken = parseStartPayload("/start abcdef012345");
  assert(startWithToken.isStart && startWithToken.token === "abcdef012345", "token payload");
  assert(
    !isWebsiteGateRefusal("Welcome to Gravy Scout — ready when you are."),
    "welcome must not look like a website-gate",
  );
  assert(
    isWebsiteGateRefusal(
      "This Telegram account is not linked yet. Sign in on the web, open Profile → Telegram, and use the one-time link.",
    ),
    "legacy unknown-user refusal must match the website-gate detector",
  );

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL is required for GS-011 cold-start acceptance. Pull `.env.local` from Vercel after Neon provisioning.",
    );
  }

  const { ensureSchema, getDb } = await import("../agent/lib/db/client.js");
  const {
    findMemberByTelegramUserId,
    getTelegramIdentityForMember,
  } = await import("../agent/lib/identity.js");
  const { listMessages } = await import("../agent/lib/conversation.js");
  const { channelIdentities, careerProfiles, conversations, members, messages } =
    await import("../agent/lib/db/schema.js");

  await ensureSchema();
  const db = getDb();
  const runId = randomUUID().replace(/-/g, "").slice(0, 12);
  // Telegram user IDs are numeric; keep them unique per run and under 2^53.
  const baseId = 8_000_000_000 + (Number.parseInt(runId.slice(0, 8), 16) % 1_000_000_000);
  const userA = String(baseId);
  const userB = String(baseId + 1);
  const userGroup = String(baseId + 2);
  const memberIds: string[] = [];

  try {
    const start = await handleTelegramInbound(
      inboundMessage({
        userId: userA,
        text: "/start",
        messageId: `${runId}-start`,
        username: "cold_start_a",
        firstName: "Ada",
      }),
    );
    assert(start.kind === "agent_turn", `bare /start must run an agent turn, got ${start.kind}`);
    assert(!isWebsiteGateRefusal(JSON.stringify(start)), "bare /start outcome is not a website-gate");
    memberIds.push(start.memberId);
    const memberAfterStart = await findMemberByTelegramUserId(userA);
    assert(memberAfterStart?.id === start.memberId, "bare /start creates the member");
    const identityA = await getTelegramIdentityForMember(start.memberId);
    assert(identityA?.externalUserId === userA, "channel identity is the Telegram user ID");
    assert(identityA?.username === "cold_start_a", "username stored as display metadata");

    const timelineStart = await listMessages(start.memberId, start.conversationId, {
      limit: 10,
    });
    assert(
      timelineStart.messages.some((m) => m.body === "/start" && m.surface === "telegram"),
      "bare /start is recorded on the conversation",
    );

    const second = await handleTelegramInbound(
      inboundMessage({
        userId: userA,
        text: "still me after a rename",
        messageId: `${runId}-second`,
        username: "renamed_ada",
        firstName: "Ada",
      }),
    );
    assert(second.kind === "agent_turn", "repeat message must continue the agent");
    assert(second.memberId === start.memberId, "same user ID must not create a second member");
    assert(
      second.conversationId === start.conversationId,
      "repeat message continues the same conversation",
    );
    const afterRename = await getTelegramIdentityForMember(start.memberId);
    assert(afterRename?.externalUserId === userA, "rename keeps the Telegram user ID");
    assert(afterRename?.username === "renamed_ada", "username change is display metadata");

    const replay = await handleTelegramInbound(
      inboundMessage({
        userId: userA,
        text: "still me after a rename",
        messageId: `${runId}-second`,
        username: "renamed_ada",
      }),
    );
    assert(replay.kind === "drop" && replay.reason === "duplicate", "webhook retry is dropped");
    const timelineReplay = await listMessages(start.memberId, start.conversationId, {
      limit: 20,
    });
    const inboundBodies = timelineReplay.messages.filter((m) => m.role === "member");
    assert(inboundBodies.length === 2, "retry must not append a second copy of the same message");

    const strangerDm = await handleTelegramInbound(
      inboundMessage({
        userId: userB,
        text: "hey, a friend shared this bot",
        messageId: `${runId}-dm`,
        username: "cold_start_b",
        firstName: "Bea",
      }),
    );
    assert(
      strangerDm.kind === "agent_turn",
      `first DM from an unknown user ID must talk, got ${strangerDm.kind}`,
    );
    assert(!isWebsiteGateRefusal(JSON.stringify(strangerDm)), "first DM is not a website-gate");
    memberIds.push(strangerDm.memberId);
    assert(strangerDm.memberId !== start.memberId, "two user IDs must be two members");
    const memberB = await findMemberByTelegramUserId(userB);
    assert(memberB?.id === strangerDm.memberId, "first DM creates a distinct member");

    const group = await handleTelegramInbound(
      inboundMessage({
        userId: userGroup,
        text: "hello from a group",
        messageId: `${runId}-group`,
        chatType: "group",
        username: "group_user",
      }),
    );
    assert(group.kind === "drop" && group.reason === "not_private", "group chats are ignored");
    assert(
      (await findMemberByTelegramUserId(userGroup)) === null,
      "group chat must not create a member",
    );

    const supergroup = await handleTelegramInbound(
      inboundMessage({
        userId: userGroup,
        text: "/start",
        messageId: `${runId}-supergroup`,
        chatType: "supergroup",
      }),
    );
    assert(
      supergroup.kind === "drop" && supergroup.reason === "not_private",
      "supergroup chats are ignored",
    );

    console.log("smoke-telegram-cold-start: ok");
  } finally {
    if (memberIds.length > 0) {
      await db.delete(messages).where(inArray(messages.memberId, memberIds));
      await db
        .delete(conversations)
        .where(inArray(conversations.memberId, memberIds));
      await db
        .delete(careerProfiles)
        .where(inArray(careerProfiles.memberId, memberIds));
      await db
        .delete(channelIdentities)
        .where(inArray(channelIdentities.memberId, memberIds));
      await db.delete(members).where(inArray(members.id, memberIds));
    }
  }
}

main().catch((err) => {
  console.error("smoke-telegram-cold-start failed:", err);
  process.exit(1);
});
