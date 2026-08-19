#!/usr/bin/env npx tsx
/**
 * GS-015 smoke: Telegram command routing, intake state machine, welcome-back.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";
import { inArray } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const proxy = readFileSync(resolve("proxy.ts"), "utf8");
  assert(
    proxy.includes("/eve/v1/telegram"),
    "proxy must allow Telegram webhook through Clerk",
  );

  const onboarding = readFileSync(resolve("components/onboarding/progressive-onboarding.tsx"), "utf8");
  assert(
    onboarding.includes("Open Telegram") || onboarding.includes("Open @"),
    "get-started success CTA must be Open Telegram",
  );
  assert(
    !onboarding.includes('router.push(nextPath.startsWith("/app")'),
    "get-started must not redirect to /app after Telegram verify",
  );

  const shell = readFileSync(resolve("components/product/app-shell.tsx"), "utf8");
  assert(
    shell.includes("Gravy Scout lives in Telegram"),
    "/app workspace must banner Telegram as home",
  );

  const {
    parseBotCommand,
    parseStartPayload,
    handleTelegramInbound,
    nextDigestLabel,
  } = await import("../agent/lib/telegram-bot.js");
  const {
    parseIdentityFreeform,
    parseRegions,
    isSkipResume,
    parseCadence,
    unresolvedIntakeStep,
  } = await import("../agent/lib/telegram-intake.js");
  const { parseTelegramCallback } = await import(
    "../agent/lib/telegram-cards.js"
  );

  const bare = parseStartPayload("/start");
  assert(bare.isStart && bare.token === null, "bare /start is a start with no token");
  const withBot = parseStartPayload("/start@GravyScoutBot", "GravyScoutBot");
  assert(withBot.isStart && withBot.token === null, "/start@bot is bare start");
  const link = parseStartPayload("/start link");
  assert(link.isStart && link.token === null, "legacy /start link is not a deep-link token");
  const token = parseStartPayload("/start abcDEF123_-");
  assert(token.isStart && token.token === "abcDEF123_-", "/start <token> keeps payload");

  assert(parseBotCommand("/help")?.name === "help", "/help");
  assert(parseBotCommand("/profile")?.name === "profile", "/profile");
  assert(parseBotCommand("/preferences")?.name === "preferences", "/preferences");
  assert(parseBotCommand("/opportunities")?.name === "opportunities", "/opportunities");
  assert(parseBotCommand("/upload")?.name === "upload", "/upload");
  assert(parseBotCommand("/pause")?.name === "pause", "/pause");
  assert(parseBotCommand("/resume")?.name === "resume", "/resume");
  assert(parseBotCommand("/start")?.name === "start", "/start command");
  assert(parseBotCommand("hello") === null, "freeform is not a command");
  assert(parseBotCommand("/unknown") === null, "unknown slash goes to the agent");

  const identity = parseIdentityFreeform("Alex, Sales Engineer at Vercel");
  assert(identity.name === "Alex", `name got ${identity.name}`);
  assert(identity.currentTitle === "Sales Engineer", `title got ${identity.currentTitle}`);
  assert(identity.currentCompany === "Vercel", `company got ${identity.currentCompany}`);
  assert(parseRegions("here").join(",") === "APAC,ANZ", "here → APAC/ANZ");
  assert(isSkipResume("later"), "later skips resume");
  assert(parseCadence("daily") === "daily", "daily cadence");
  assert(
    parseTelegramCallback("gs:c:da")?.kind === "cadence",
    "cadence callback",
  );
  assert(
    parseTelegramCallback(
      "gs:o:i:0123456789abcdef0123456789abcdef",
    )?.kind === "opportunity",
    "opportunity callback expands compact id",
  );
  assert(
    nextDigestLabel("realtime").includes("scan"),
    "realtime digest label",
  );

  if (!process.env.DATABASE_URL?.trim()) {
    console.log(
      JSON.stringify({ ok: true, database: false, parsers: true }, null, 2),
    );
    return;
  }

  const { ensureSchema, getDb } = await import("../agent/lib/db/client.js");
  const { getMemberContextSnapshot } = await import(
    "../agent/lib/career-profile.js"
  );
  const {
    careerProfiles,
    channelIdentities,
  conversations,
  digestDeliveries,
  feedbackEvents,
  members,
  messages,
  preferences,
  agentSessions,
} = await import("../agent/lib/db/schema.js");

  await ensureSchema();
  const db = getDb();
  const runId = randomUUID().slice(0, 8);
  const telegramUserId = String(9_000_000_000 + Math.floor(Math.random() * 1e8));
  const memberIds: string[] = [];

  const inbound = (text: string, extras?: { messageId?: string }) => ({
    kind: "message" as const,
    text,
    telegramUserId,
    chatId: `chat-${runId}`,
    username: `gs015_${runId}`,
    displayName: "Alex Scout",
    messageId: extras?.messageId ?? randomUUID(),
    attachments: [] as { fileId: string; fileName?: string; mediaType?: string; kind: "document" | "photo" }[],
  });

  try {
    const start1 = await handleTelegramInbound(inbound("/start"));
    assert(!start1.routeToAgent, "/start must not go to the LLM");
    assert(start1.memberId, "/start must create a member");
    assert(/gravy scout/i.test(start1.text), "welcome mentions Gravy Scout");
    assert(/name and current role/i.test(start1.text), "first intake question");
    memberIds.push(start1.memberId);

    const ident = await handleTelegramInbound(
      inbound("Alex, Sales Engineer at Vercel"),
    );
    assert(/target role/i.test(ident.text), `expected target roles, got: ${ident.text}`);

    const roles = await handleTelegramInbound(
      inbound("Sales Engineer, Field Engineer"),
    );
    assert(/stage and industry|thesis/i.test(roles.text), `thesis prompt: ${roles.text}`);

    const thesis = await handleTelegramInbound(inbound("AI-native, Series A+"));
    assert(/region/i.test(thesis.text), `regions prompt: ${thesis.text}`);

    const regions = await handleTelegramInbound(inbound("here"));
    assert(/résumé|resume|later/i.test(regions.text), `resume prompt: ${regions.text}`);

    const midStart = await handleTelegramInbound(inbound("/start"));
    assert(/résumé|resume|later/i.test(midStart.text), `/start mid-intake resumes: ${midStart.text}`);
    assert(!/welcome back/i.test(midStart.text), "mid-intake /start is not welcome-back");

    const resume = await handleTelegramInbound(inbound("later"));
    assert(/realtime|daily|weekly/i.test(resume.text), `cadence prompt: ${resume.text}`);
    assert(resume.replyMarkup, "cadence has inline keyboard");

    const cadence = await handleTelegramInbound(inbound("daily"));
    assert(/i'll message you when the next scan runs/i.test(cadence.text), cadence.text);
    assert(/\/opportunities/i.test(cadence.text), "confirmation mentions /opportunities");

    const snapshot = await getMemberContextSnapshot(start1.memberId);
    assert(snapshot.identity.name === "Alex", "name persisted");
    assert(snapshot.identity.currentTitle === "Sales Engineer", "title persisted");
    assert(snapshot.identity.currentCompany === "Vercel", "company persisted");
    assert(
      snapshot.document.goals?.targetTitles?.includes("Field Engineer"),
      "target roles persisted",
    );
    assert(snapshot.document.constraints?.locations?.includes("APAC"), "regions persisted");
    assert(snapshot.document.messaging?.digestCadence === "daily", "cadence persisted");
    assert(snapshot.document.intake?.status === "complete", "intake complete");
    assert(unresolvedIntakeStep(snapshot) === "complete", "no unanswered fields");

    const back = await handleTelegramInbound(inbound("/start"));
    assert(/welcome back/i.test(back.text), `welcome-back: ${back.text}`);
    assert(/profile \d+%/i.test(back.text), "status includes completeness");

    const profile = await handleTelegramInbound(inbound("/profile"));
    assert(/Sales Engineer/i.test(profile.text), "/profile shows role");
    assert(/Field Engineer/i.test(profile.text), "/profile shows goals");

    const prefs = await handleTelegramInbound(inbound("/preferences"));
    assert(/cadence/i.test(prefs.text), "/preferences");
    assert(prefs.replyMarkup, "preferences keyboard");

    const help = await handleTelegramInbound(inbound("/help"));
    assert(
      /\/start/i.test(help.text) && /gravy scout/i.test(help.text),
      "/help lists commands",
    );
    assert(/\/pause/i.test(help.text), "/help lists pause");

    const pause = await handleTelegramInbound(inbound("/pause"));
    assert(/paused/i.test(pause.text), "/pause");
    const resumeCmd = await handleTelegramInbound(inbound("/resume"));
    assert(/resumed/i.test(resumeCmd.text), "/resume");

    const upload = await handleTelegramInbound(inbound("/upload"));
    assert(/connections\.csv/i.test(upload.text), "/upload prompt");

    const csvReply = await handleTelegramInbound({
      ...inbound(""),
      attachments: [
        {
          fileId: "file-csv",
          fileName: "Connections.csv",
          mediaType: "text/csv",
          kind: "document",
        },
      ],
    }, {
      fetchAttachment: async () => ({
        bytes: Buffer.from("First Name,Last Name,Email Address,Company\nAda,Lovelace,ada@example.invalid,Analytical"),
        fileName: "Connections.csv",
        mediaType: "text/csv",
      }),
    });
    assert(/saved — connection matching coming soon/i.test(csvReply.text), csvReply.text);

    const opps = await handleTelegramInbound(inbound("/opportunities"));
    assert(opps.text.length > 0, "/opportunities replies");

    const chat = await handleTelegramInbound(inbound("why Fireworks?"));
    assert(chat.routeToAgent, "unknown text reaches the agent");
    assert(chat.memberId === start1.memberId, "agent path keeps member");

    const cb = await handleTelegramInbound({
      kind: "callback",
      text: "gs:c:we",
      telegramUserId,
      chatId: `chat-${runId}`,
      username: `gs015_${runId}`,
      displayName: "Alex Scout",
      messageId: randomUUID(),
      attachments: [],
      callbackData: "gs:c:we",
      callbackQueryId: randomUUID(),
    });
    assert(/weekly/i.test(cb.text), `cadence callback: ${cb.text}`);

    console.log(
      JSON.stringify(
        {
          ok: true,
          memberId: start1.memberId,
          checks: [
            "bare /start welcome + intake",
            "mid-intake /start resumes",
            "complete intake + /profile + cadence",
            "welcome-back skips re-intake",
            "commands reply",
            "freeform routes to agent",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    if (memberIds.length) {
      await db.delete(messages).where(inArray(messages.memberId, memberIds));
      await db
        .delete(agentSessions)
        .where(inArray(agentSessions.memberId, memberIds));
      await db
        .delete(digestDeliveries)
        .where(inArray(digestDeliveries.memberId, memberIds));
      await db.delete(feedbackEvents).where(inArray(feedbackEvents.memberId, memberIds));
      await db.delete(preferences).where(inArray(preferences.memberId, memberIds));
      await db
        .delete(careerProfiles)
        .where(inArray(careerProfiles.memberId, memberIds));
      await db
        .delete(conversations)
        .where(inArray(conversations.memberId, memberIds));
      await db
        .delete(channelIdentities)
        .where(inArray(channelIdentities.memberId, memberIds));
      await db.delete(members).where(inArray(members.id, memberIds));
    }
  }
}

main().catch((error) => {
  console.error("smoke-telegram-bot failed:", error);
  process.exitCode = 1;
});
