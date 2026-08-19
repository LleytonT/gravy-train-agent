#!/usr/bin/env npx tsx
/**
 * GS-007 acceptance smoke: discovery claim/retry, evidence citations,
 * candidate-role kinds, hard constraints, noop digests, score version.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

const {
  analyzeFit,
  extractJobAlertFromSourceItem,
  deriveSecondaryCandidatesFromResearch,
  hardConstraintViolation,
  runDiscovery,
  deliverDigestsForRun,
  SCORE_VERSION,
  createLimitTracker,
  CANDIDATE_ROLE_KINDS,
} = await import("../agent/lib/discovery/index.js");
const { ensureSchema, getDb } = await import("../agent/lib/db/client.js");
const { applyExplicitProfileChanges } = await import(
  "../agent/lib/career-profile.js"
);
const { listMessages } = await import("../agent/lib/conversation.js");
const {
  createTelegramLinkToken,
  consumeTelegramLinkToken,
  revokeTelegramIdentity,
} = await import("../agent/lib/identity.js");
const { saveMessagingDestination } = await import(
  "../agent/lib/messaging.js"
);
const { sendProactiveTelegramMessage } = await import(
  "../agent/lib/telegram-send.js"
);
const { ingestSourceItems } = await import("../agent/lib/ingestion/index.js");
const { listingContentHash } = await import(
  "../agent/lib/ingestion/hash.js"
);
const { canonicalizeJobUrl } = await import(
  "../agent/lib/ingestion/canonical-url.js"
);
const {
  members,
  sourceItems,
  sourceItemReceipts,
  signals,
  signalSources,
  candidateRoles,
  opportunities,
  opportunityEvidence,
  discoveryRuns,
  digestDeliveries,
  companyDossiers,
  companies,
  connections,
  inboundQuarantine,
  conversations,
  messages,
  channelIdentities,
  channelLinkTokens,
} = await import("../agent/lib/db/schema.js");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function recordingTelegram() {
  const sends: Array<{ chatId: string; text: string }> = [];
  return {
    sends,
    transport: {
      async sendMessage({ chatId, text }: { chatId: string; text: string }) {
        sends.push({ chatId, text });
        return { ok: true as const, messageId: String(sends.length) };
      },
    },
  };
}

async function main() {
  // Pure checks
  assert(CANDIDATE_ROLE_KINDS.includes("advertised"), "advertised kind");
  assert(CANDIDATE_ROLE_KINDS.includes("rumored"), "rumored kind");
  assert(CANDIDATE_ROLE_KINDS.includes("inferred"), "inferred kind");
  assert(SCORE_VERSION.startsWith("scoring.ts@"), "score version migration tag");

  const extracted = extractJobAlertFromSourceItem({
    title: "Sales Engineer",
    excerpt: "Sales Engineer at Decagon",
    canonicalUrl: "https://linkedin.com/jobs/view/1",
    payload: { company: "Decagon", location: "Sydney", board: "linkedin" },
  });
  assert(extracted?.kind === "advertised", "job alert → advertised");

  const secondary = deriveSecondaryCandidatesFromResearch({
    companyName: "Decagon",
    summary: "Quiet week",
    snippets: [
      {
        title: "Chatter",
        snippet:
          "Rumored they are hiring a Forward Deployed Engineer in Melbourne",
      },
    ],
    advertisedTitle: "Sales Engineer",
  });
  assert(
    secondary.some((c) => c.kind === "rumored"),
    "research rumor → rumored kind",
  );
  assert(
    deriveSecondaryCandidatesFromResearch({
      companyName: "Sierra",
      summary: "Sierra is hiring a Deployment Engineer in Sydney",
      snippets: [],
      advertisedTitle: "Other",
    }).some((c) => c.kind === "inferred"),
    "research hiring → inferred kind",
  );

  assert(
    hardConstraintViolation("San Francisco, CA", {
      locations: ["Sydney", "Melbourne"],
    }) !== null,
    "hard location constraint fires",
  );
  assert(
    hardConstraintViolation({
      roleLocation: "Sydney",
      compensation: 80_000,
      constraints: { compensationMin: 120_000, compensationCurrency: "AUD" },
    }) !== null,
    "hard compensation constraint fires when listing pay is known",
  );

  const excluded = analyzeFit({
    roleTitle: "Sales Engineer",
    roleLocation: "San Francisco, CA",
    companyName: "Decagon",
    companyScore: {
      score: 9,
      timing: 4,
      territory: 3,
      talent: 2,
      negativeDrag: 0,
      rationale: ["Compound timing"],
      pingTier: "immediate",
    },
    signalIds: ["sig_abc"],
    signalSummaries: ["Hiring APAC SE"],
    constraints: { locations: ["Sydney"] },
  });
  assert(!excluded.eligible, "high score cannot beat hard constraint");
  assert(excluded.rationale.includes("sig_abc"), "exclusion cites evidence");

  const tracker = createLimitTracker({ maxWebSearches: 1, maxModelCalls: 1 });
  tracker.recordWebSearch();
  assert(!tracker.canWebSearch(), "web search limit enforced");
  let limitThrown = false;
  try {
    tracker.recordWebSearch();
  } catch {
    limitThrown = true;
  }
  assert(limitThrown, "web search over-limit is observable");
  tracker.recordModelCall();
  let modelLimitThrown = false;
  try {
    tracker.recordModelCall();
  } catch {
    modelLimitThrown = true;
  }
  assert(modelLimitThrown, "model call over-limit is observable");

  const schedule = readFileSync(resolve("agent/schedules/nightly_scout.ts"), "utf8");
  assert(schedule.includes("runDiscovery"), "schedule calls runDiscovery");
  assert(!schedule.includes("markdown:"), "schedule is not free-form markdown");

  const prevTokenForPure = process.env.TELEGRAM_BOT_TOKEN;
  const prevUsernameForPure = process.env.TELEGRAM_BOT_USERNAME;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_USERNAME;
  try {
    const unconfigured = await sendProactiveTelegramMessage({
      memberId: "00000000-0000-0000-0000-000000000000",
      body: "Gravy Scout digest — should not send",
    });
    assert(
      unconfigured.status === "skipped" &&
        unconfigured.reason === "bot_not_configured",
      "unconfigured Telegram stays silent",
    );
  } finally {
    if (prevTokenForPure === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = prevTokenForPure;
    if (prevUsernameForPure === undefined) {
      delete process.env.TELEGRAM_BOT_USERNAME;
    } else {
      process.env.TELEGRAM_BOT_USERNAME = prevUsernameForPure;
    }
  }

  console.log("smoke-discovery: pure checks ok");

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL required for DB acceptance. Pull `.env.local` then `pnpm db:migrate`.",
    );
  }

  await ensureSchema();
  const db = getDb();
  const runId = randomUUID();
  const memberIds: string[] = [];
  const companyIds: string[] = [];

  try {
    const [member] = await db
      .insert(members)
      .values({
        externalAuthId: `discovery-smoke-${runId}`,
        email: `discovery-${runId}@example.invalid`,
        displayName: "Discovery Smoke",
      })
      .returning({ id: members.id });
    assert(member, "member");
    memberIds.push(member.id);

    await applyExplicitProfileChanges(member.id, {
      currentTitle: "Sales Engineer",
      currentCompany: "Vercel",
      location: "Sydney",
      constraints: {
        locations: ["Sydney", "Melbourne", "Remote Australia"],
        remotePreference: "hybrid",
      },
      goals: { targetTitles: ["Sales Engineer", "Forward Deployed Engineer"] },
    });

    const url = canonicalizeJobUrl(
      `https://www.linkedin.com/jobs/view/${runId.slice(0, 8)}/?utm_source=test`,
    );
    assert(url, "canonical url");
    const hash = listingContentHash({
      url,
      title: "Sales Engineer",
      company: "Decagon",
      location: "Sydney",
    });

    // Unique company name so cleanup never touches seeded dossiers.
    const companyName = `Smoke Discovery Co ${runId.slice(0, 8)}`;

    await ingestSourceItems([
      {
        memberId: member.id,
        sourceType: "job_listing",
        visibility: "member",
        canonicalUrl: url,
        contentHash: hash,
        title: "Sales Engineer",
        excerpt: `Sales Engineer at ${companyName} · Sydney`,
        payload: {
          board: "linkedin",
          company: companyName,
          location: "Sydney",
          researchNotes:
            "Rumored they are hiring a Forward Deployed Engineer in Melbourne",
        },
        receipt: {
          provider: "smoke",
          idempotencyKey: `smoke-discovery:${runId}:listing:0`,
        },
      },
    ]);

    // Constraint-violating listing for exclusion check
    await ingestSourceItems([
      {
        memberId: member.id,
        sourceType: "job_listing",
        visibility: "member",
        canonicalUrl: `https://example.invalid/jobs/${runId}-sf`,
        contentHash: listingContentHash({
          url: `https://example.invalid/jobs/${runId}-sf`,
          title: "Sales Engineer",
          company: companyName,
          location: "San Francisco",
        }),
        title: "Sales Engineer",
        excerpt: `Sales Engineer at ${companyName} — San Francisco`,
        payload: {
          board: "generic",
          company: companyName,
          location: "San Francisco, CA",
        },
        receipt: {
          provider: "smoke",
          idempotencyKey: `smoke-discovery:${runId}:listing:1`,
        },
      },
    ]);

    const key = `smoke-discovery-run:${runId}`;
    const first = await runDiscovery({
      kind: "manual",
      idempotencyKey: key,
      memberId: member.id,
      skipWebSearch: true,
      limits: { maxWebSearches: 0, maxSourceItems: 10 },
    });
    assert(
      first.status === "completed" || first.status === "noop",
      `first run status ${first.status}`,
    );
    assert(first.counts.sourceItemsProcessed >= 2, "processed source items");
    assert(first.counts.signalsUpserted >= 1, "signals upserted");
    assert(first.limits.maxWebSearches === 0, "limits observable");

    const roles = await db
      .select()
      .from(candidateRoles)
      .where(eq(candidateRoles.memberId, member.id));
    assert(roles.some((r) => r.kind === "advertised"), "advertised role labeled");
    assert(roles.some((r) => r.kind === "rumored"), "rumored role labeled");
    companyIds.push(...new Set(roles.map((r) => r.companyId)));

    const opps = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.memberId, member.id));
    assert(opps.length >= 1, "opportunity created for Sydney role");
    assert(
      opps.every((o) => o.scoreVersion === SCORE_VERSION),
      "score version persisted",
    );
    assert(
      opps.every((o) => (o.rationale ?? "").includes("Cited evidence")),
      "rationale cites evidence",
    );

    for (const opp of opps) {
      const evidence = await db
        .select()
        .from(opportunityEvidence)
        .where(eq(opportunityEvidence.opportunityId, opp.id));
      assert(evidence.length >= 1, "opportunity has evidence rows");
    }

    assert(
      first.counts.opportunitiesExcludedByConstraint >= 1,
      "SF role excluded by hard constraint",
    );

    const retry = await runDiscovery({
      kind: "retry",
      idempotencyKey: key,
      memberId: member.id,
      skipWebSearch: true,
    });
    assert(retry.status === "already_completed", "retry is idempotent");

    const signalCount = await db
      .select({ id: signals.id })
      .from(signals)
      .where(inArray(signals.companyId, companyIds));
    const signalCountAfter = signalCount.length;

    const retryAgain = await runDiscovery({
      kind: "manual",
      idempotencyKey: key,
      memberId: member.id,
      skipWebSearch: true,
    });
    assert(retryAgain.status === "already_completed", "second retry still noop");

    const signalCountFinal = (
      await db
        .select({ id: signals.id })
        .from(signals)
        .where(inArray(signals.companyId, companyIds))
    ).length;
    assert(signalCountFinal === signalCountAfter, "signals not duplicated");

    const digests = await db
      .select()
      .from(digestDeliveries)
      .where(eq(digestDeliveries.memberId, member.id));
    assert(digests.length >= 1, "digest delivery row exists");
    assert(first.counts.digestsDelivered === 0, "unlinked member is not sent a digest");
    assert(first.counts.digestsSkipped >= 1, "unlinked member digest is skipped");
    assert(
      digests.every((d) => d.status !== "sent"),
      "unlinked digest must not be marked sent",
    );

    const prevToken = process.env.TELEGRAM_BOT_TOKEN;
    const prevUsername = process.env.TELEGRAM_BOT_USERNAME;
    process.env.TELEGRAM_BOT_TOKEN = "smoke-telegram-token";
    process.env.TELEGRAM_BOT_USERNAME = "gravy_scout_smoke_bot";

    try {
    const telegramUserId = `4242${runId.slice(0, 8)}`;
    const minted = await createTelegramLinkToken(member.id);
    await consumeTelegramLinkToken({
      token: minted.token,
      telegramUserId,
      username: "digest_smoke",
    });
    await saveMessagingDestination(member.id, {
      telegramChatId: telegramUserId,
      telegramUsername: "digest_smoke",
      consentUpdates: true,
      markLinked: true,
    });

    const { transport, sends } = recordingTelegram();
    const noon = new Date("2026-01-01T12:00:00.000Z");
    const materialResults = opps.map((opp) => ({
      opportunityId: opp.id,
      memberId: member.id,
      created: true,
      materialChanged: true,
      excludedByConstraint: false,
    }));

    const digestCompany = `Smoke Digest Co ${runId.slice(0, 8)}`;
    const digestUrl = canonicalizeJobUrl(
      `https://www.linkedin.com/jobs/view/${runId.slice(0, 8)}d/?utm_source=test`,
    );
    assert(digestUrl, "digest listing url");
    await ingestSourceItems([
      {
        memberId: member.id,
        sourceType: "job_listing",
        visibility: "member",
        canonicalUrl: digestUrl,
        contentHash: listingContentHash({
          url: digestUrl,
          title: "Forward Deployed Engineer",
          company: digestCompany,
          location: "Sydney",
        }),
        title: "Forward Deployed Engineer",
        excerpt: `Forward Deployed Engineer at ${digestCompany} · Sydney`,
        payload: {
          board: "linkedin",
          company: digestCompany,
          location: "Sydney",
        },
        receipt: {
          provider: "smoke",
          idempotencyKey: `smoke-discovery:${runId}:listing:digest`,
        },
      },
    ]);

    const telegramKey = `smoke-discovery-telegram:${runId}`;
    const telegramOutcome = await runDiscovery(
      {
        kind: "manual",
        idempotencyKey: telegramKey,
        memberId: member.id,
        skipWebSearch: true,
        asOf: noon,
        limits: { maxWebSearches: 0, maxSourceItems: 10 },
      },
      { telegram: transport },
    );
    assert(
      telegramOutcome.counts.digestsDelivered >= 1,
      "consenting linked member receives a digest",
    );
    assert(sends.length === 1, "telegram send called once");
    assert(sends[0]?.chatId === telegramUserId, "digest sent to linked chat");
    assert(/Gravy Scout digest/i.test(sends[0]?.text ?? ""), "digest body sent");

    const afterSend = (
      await db
        .select()
        .from(digestDeliveries)
        .where(eq(digestDeliveries.memberId, member.id))
    ).find((row) => row.status === "sent");
    assert(afterSend, "telegram digest recorded sent");
    assert(afterSend.channel === "telegram", "digest channel is telegram");
    assert(afterSend.conversationId, "digest linked to conversation");

    const digestCompanyRow = (
      await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.name, digestCompany))
        .limit(1)
    )[0];
    if (digestCompanyRow) companyIds.push(digestCompanyRow.id);

    const timeline = await listMessages(member.id, afterSend.conversationId, {
      limit: 20,
    });
    assert(
      timeline.messages.some(
        (m) =>
          m.surface === "telegram" &&
          m.role === "assistant" &&
          /Gravy Scout digest/i.test(m.body),
      ),
      "digest recorded on the canonical conversation",
    );

    const replay = await runDiscovery(
      {
        kind: "retry",
        idempotencyKey: telegramKey,
        memberId: member.id,
        skipWebSearch: true,
        asOf: noon,
      },
      { telegram: transport },
    );
    assert(replay.status === "already_completed", "retry of the same run is idempotent");
    assert(sends.length === 1, "retry does not double-send telegram");

    await saveMessagingDestination(member.id, {
      quietHours: { start: "22:00", end: "07:00", timezone: "UTC" },
    });
    const [quietRun] = await db
      .insert(discoveryRuns)
      .values({
        idempotencyKey: `smoke-digest-quiet:${runId}`,
        status: "completed",
        trigger: "manual",
      })
      .returning({ id: discoveryRuns.id });
    assert(quietRun, "quiet-hours digest run");
    const quietDigest = await deliverDigestsForRun({
      discoveryRunId: quietRun.id,
      opportunityResults: materialResults,
      now: new Date("2026-01-01T23:30:00.000Z"),
      telegram: transport,
    });
    assert(
      quietDigest.every((d) => d.reason === "quiet_hours"),
      "quiet hours suppress proactive send",
    );
    assert(sends.length === 1, "quiet hours do not send telegram");

    await saveMessagingDestination(member.id, {
      quietHours: { start: null, end: null, timezone: null },
      telegramChatId: telegramUserId,
      consentUpdates: true,
    });
    await revokeTelegramIdentity(member.id);
    const [revokedRun] = await db
      .insert(discoveryRuns)
      .values({
        idempotencyKey: `smoke-digest-revoked:${runId}`,
        status: "completed",
        trigger: "manual",
      })
      .returning({ id: discoveryRuns.id });
    assert(revokedRun, "revoked digest run");
    const revokedDigest = await deliverDigestsForRun({
      discoveryRunId: revokedRun.id,
      opportunityResults: materialResults,
      now: noon,
      telegram: transport,
    });
    assert(
      revokedDigest.every((d) => d.reason === "no_active_telegram_identity"),
      "revoked channel identity suppresses proactive send",
    );
    assert(sends.length === 1, "revoked identity does not send telegram");
    } finally {
      if (prevToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
      else process.env.TELEGRAM_BOT_TOKEN = prevToken;
      if (prevUsername === undefined) delete process.env.TELEGRAM_BOT_USERNAME;
      else process.env.TELEGRAM_BOT_USERNAME = prevUsername;
    }

    // Noop digest path: empty run with fresh key
    const noop = await runDiscovery({
      kind: "manual",
      idempotencyKey: `smoke-discovery-empty:${runId}`,
      memberId: member.id,
      skipWebSearch: true,
    });
    assert(noop.status === "noop", "empty run status is noop");
    assert(noop.counts.digestsDelivered === 0, "noop delivers no digest");
    assert(noop.counts.opportunitiesUpserted === 0, "noop upserts no opportunities");

    console.log("smoke-discovery: ok", {
      first: first.counts,
      scoreVersion: SCORE_VERSION,
    });
  } finally {
    if (memberIds.length > 0) {
      const oppIds = (
        await db
          .select({ id: opportunities.id })
          .from(opportunities)
          .where(inArray(opportunities.memberId, memberIds))
      ).map((r) => r.id);
      if (oppIds.length) {
        await db
          .delete(opportunityEvidence)
          .where(inArray(opportunityEvidence.opportunityId, oppIds));
        await db.delete(opportunities).where(inArray(opportunities.id, oppIds));
      }
      await db
        .delete(digestDeliveries)
        .where(inArray(digestDeliveries.memberId, memberIds));
      await db
        .delete(candidateRoles)
        .where(inArray(candidateRoles.memberId, memberIds));
      const sourceIds = (
        await db
          .select({ id: sourceItems.id })
          .from(sourceItems)
          .where(inArray(sourceItems.memberId, memberIds))
      ).map((r) => r.id);
      if (sourceIds.length) {
        await db
          .delete(signalSources)
          .where(inArray(signalSources.sourceItemId, sourceIds));
        await db
          .delete(sourceItemReceipts)
          .where(inArray(sourceItemReceipts.sourceItemId, sourceIds));
        await db.delete(sourceItems).where(inArray(sourceItems.id, sourceIds));
      }
      if (companyIds.length) {
        await db.delete(signals).where(inArray(signals.companyId, companyIds));
        await db
          .delete(companyDossiers)
          .where(inArray(companyDossiers.companyId, companyIds));
        // Best-effort: skip if another table still references the company.
        try {
          await db.delete(companies).where(inArray(companies.id, companyIds));
        } catch {
          // leave shared/seeded companies alone
        }
      }
      await db
        .delete(messages)
        .where(inArray(messages.memberId, memberIds));
      await db
        .delete(conversations)
        .where(inArray(conversations.memberId, memberIds));
      await db
        .delete(connections)
        .where(inArray(connections.memberId, memberIds));
      await db
        .delete(inboundQuarantine)
        .where(inArray(inboundQuarantine.memberId, memberIds));
      await db
        .delete(channelLinkTokens)
        .where(inArray(channelLinkTokens.memberId, memberIds));
      await db
        .delete(channelIdentities)
        .where(inArray(channelIdentities.memberId, memberIds));
      const runs = await db.select().from(discoveryRuns);
      const smokeRuns = runs.filter((r) => r.idempotencyKey.includes(runId));
      if (smokeRuns.length) {
        await db
          .delete(discoveryRuns)
          .where(inArray(discoveryRuns.id, smokeRuns.map((r) => r.id)));
      }
      // career profile cascade via member delete
      await db.delete(members).where(inArray(members.id, memberIds));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
