#!/usr/bin/env npx tsx
/**
 * GS-004 smoke checks for the canonical conversation module.
 * Does not require a running Next server.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { inArray } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

const { ensureSchema, getDb } = await import("../agent/lib/db/client.js");
const {
  appendMessage,
  associateAgentSession,
  beginSurfaceTurn,
  completeSurfaceTurn,
  countMemberDurableState,
  createConversation,
  getAgentSession,
  getConversation,
  listConversations,
  listMessages,
  projectContextForSurface,
} = await import("../agent/lib/conversation.js");
const {
  careerProfiles,
  feedbackEvents,
  members,
  messages,
} = await import("../agent/lib/db/schema.js");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const conversationModule = readFileSync(
    resolve("agent/lib/conversation.ts"),
    "utf8",
  );
  assert(
    conversationModule.includes("appendMessage"),
    "conversation module missing appendMessage",
  );
  assert(
    conversationModule.includes("beginSurfaceTurn"),
    "conversation module missing beginSurfaceTurn",
  );

  const threadStorageGone = (() => {
    try {
      readFileSync(resolve("components/chat/thread-storage.ts"), "utf8");
      return false;
    } catch {
      return true;
    }
  })();
  assert(threadStorageGone, "legacy thread-storage.ts should be removed");

  const shell = readFileSync(resolve("components/chat/chat-shell.tsx"), "utf8");
  assert(
    shell.includes("fetchConversations"),
    "chat shell must load server conversations",
  );
  assert(
    !shell.includes("saveThreads"),
    "chat shell must not persist threads in localStorage",
  );

  await ensureSchema();
  const db = getDb();
  const runId = randomUUID();
  const memberIds: string[] = [];

  try {
    const createdMembers = await db
      .insert(members)
      .values([
        {
          externalAuthId: `conv-a-${runId}`,
          email: `conv-a-${runId}@example.invalid`,
          displayName: "Conversation A",
        },
        {
          externalAuthId: `conv-b-${runId}`,
          email: `conv-b-${runId}@example.invalid`,
          displayName: "Conversation B",
        },
      ])
      .returning({ id: members.id });
    memberIds.push(...createdMembers.map((row) => row.id));
    const [memberA, memberB] = memberIds;
    assert(memberA && memberB, "expected two members");

    await db.insert(careerProfiles).values({
      memberId: memberA,
      currentTitle: "Solutions Engineer",
      profile: { interests: ["developer tools"] },
    });
    await db.insert(feedbackEvents).values({
      memberId: memberA,
      kind: "preference_correction",
      subjectType: "career_profile",
      payload: { note: "prefer APAC remote" },
    });
    const before = await countMemberDurableState(memberA);

    const conversationA = await createConversation(memberA, {
      title: "Member A scout",
    });
    const conversationB = await createConversation(memberB, {
      title: "Member B scout",
    });
    assert(conversationA.id !== conversationB.id, "distinct conversations");

    const listedA = await listConversations(memberA);
    assert(
      listedA.conversations.every((row) => row.memberId === memberA),
      "listConversations must be member-scoped",
    );
    assert(
      !listedA.conversations.some((row) => row.id === conversationB.id),
      "member A must not see member B conversations",
    );

    let crossReadBlocked = false;
    try {
      await getConversation(memberB, conversationA.id);
    } catch {
      crossReadBlocked = true;
    }
    assert(crossReadBlocked, "cross-member conversation read must fail");

    const first = await beginSurfaceTurn({
      memberId: memberA,
      conversationId: conversationA.id,
      surface: "web",
      body: "What roles fit an SE at Vercel?",
      idempotencyKey: `smoke-web-${runId}-1`,
    });
    assert(first.created, "first begin should create a message");
    const replay = await beginSurfaceTurn({
      memberId: memberA,
      conversationId: conversationA.id,
      surface: "web",
      body: "What roles fit an SE at Vercel?",
      idempotencyKey: `smoke-web-${runId}-1`,
    });
    assert(!replay.created, "replayed begin must not duplicate");
    assert(replay.message.id === first.message.id, "replay returns same row");

    const telegram = await appendMessage({
      memberId: memberA,
      conversationId: conversationA.id,
      role: "member",
      surface: "telegram",
      body: "Also check Decagon while you are at it.",
      idempotencyKey: `smoke-telegram-${runId}-1`,
    });
    assert(telegram.created, "telegram append should create");

    const ordered = await listMessages(memberA, conversationA.id, {
      direction: "forward",
      limit: 20,
    });
    assert(ordered.messages.length === 2, "expected two canonical messages");
    assert(
      ordered.messages[0]!.idempotencyKey === `smoke-web-${runId}-1`,
      "deterministic oldest-first ordering",
    );
    assert(
      ordered.messages[1]!.surface === "telegram",
      "telegram message preserved on shared timeline",
    );

    const projection = await projectContextForSurface(
      memberA,
      conversationA.id,
      "web",
    );
    assert(
      projection.recentMessageCount >= 2,
      "context projection includes recent messages",
    );

    const completed = await completeSurfaceTurn({
      memberId: memberA,
      conversationId: conversationA.id,
      surface: "web",
      assistantBody: "Decagon Field Engineer looks strong for your SE background.",
      assistantIdempotencyKey: `assistant:web:smoke-${runId}`,
      eveSessionId: `ses_smoke_${runId}`,
      continuationTokenRef: `eve:token:${runId}`,
      lastEventIndex: 4,
    });
    assert(completed.created, "assistant message created");
    const completedReplay = await completeSurfaceTurn({
      memberId: memberA,
      conversationId: conversationA.id,
      surface: "web",
      assistantBody: "Decagon Field Engineer looks strong for your SE background.",
      assistantIdempotencyKey: `assistant:web:smoke-${runId}`,
      eveSessionId: `ses_smoke_${runId}`,
      continuationTokenRef: `eve:token:${runId}:stale`,
      lastEventIndex: 2,
    });
    assert(!completedReplay.created, "assistant complete is idempotent");
    assert(
      completedReplay.agentSession.lastEventIndex === 4,
      "stale stream index must not rewind the cursor",
    );
    assert(
      completedReplay.agentSession.continuationTokenRef ===
        `eve:token:${runId}`,
      "stale continuation token must not overwrite a newer cursor",
    );

    const sessionA = await getAgentSession(memberA, conversationA.id, "web");
    assert(sessionA?.eveSessionId === `ses_smoke_${runId}`, "session stored");

    let foreignSessionBlocked = false;
    try {
      await getAgentSession(memberB, conversationA.id, "web");
    } catch {
      foreignSessionBlocked = true;
    }
    assert(foreignSessionBlocked, "member B cannot read member A session");

    await associateAgentSession({
      memberId: memberA,
      conversationId: conversationA.id,
      surface: "telegram",
      eveSessionId: `ses_telegram_${runId}`,
      continuationTokenRef: `eve:telegram:${runId}`,
      lastEventIndex: 1,
      summary: "Telegram thread asked about Decagon.",
    });

    const fresh = await createConversation(memberA, { title: "Fresh scout" });
    assert(fresh.id !== conversationA.id, "fresh conversation is a new row");
    const after = await countMemberDurableState(memberA);
    assert(
      after.profiles === before.profiles && after.feedback === before.feedback,
      "fresh conversation must not erase career profile or feedback",
    );

    let rejectedCrossMemberAppend = false;
    try {
      await appendMessage({
        memberId: memberB,
        conversationId: conversationA.id,
        role: "member",
        surface: "web",
        body: "inject",
        idempotencyKey: `smoke-cross-${runId}`,
      });
    } catch {
      rejectedCrossMemberAppend = true;
    }
    assert(
      rejectedCrossMemberAppend,
      "cross-member append into foreign conversation must fail",
    );

    const messageCount = await db
      .select()
      .from(messages)
      .where(inArray(messages.conversationId, [conversationA.id, fresh.id]));
    assert(messageCount.length >= 3, "messages persisted for smoke run");

    console.log("smoke-conversation: ok");
  } finally {
    if (memberIds.length > 0) {
      await db.delete(members).where(inArray(members.id, memberIds));
    }
  }
}

main().catch((error) => {
  console.error("smoke-conversation: failed");
  console.error(error);
  process.exitCode = 1;
});
