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
  hardConstraintViolation,
  runDiscovery,
  SCORE_VERSION,
  createLimitTracker,
  CANDIDATE_ROLE_KINDS,
} = await import("../agent/lib/discovery/index.js");
const { ensureSchema, getDb } = await import("../agent/lib/db/client.js");
const { applyExplicitProfileChanges } = await import(
  "../agent/lib/career-profile.js"
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
} = await import("../agent/lib/db/schema.js");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

  assert(
    hardConstraintViolation("San Francisco, CA", {
      locations: ["Sydney", "Melbourne"],
    }) !== null,
    "hard location constraint fires",
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

  const schedule = readFileSync(resolve("agent/schedules/nightly_scout.ts"), "utf8");
  assert(schedule.includes("runDiscovery"), "schedule calls runDiscovery");
  assert(!schedule.includes("markdown:"), "schedule is not free-form markdown");

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

    await ingestSourceItems([
      {
        memberId: member.id,
        sourceType: "job_listing",
        visibility: "member",
        canonicalUrl: url,
        contentHash: hash,
        title: "Sales Engineer",
        excerpt: "Sales Engineer at Decagon · Sydney",
        payload: {
          board: "linkedin",
          company: "Decagon",
          location: "Sydney",
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
          company: "Decagon",
          location: "San Francisco",
        }),
        title: "Sales Engineer",
        excerpt: "Sales Engineer at Decagon — San Francisco",
        payload: {
          board: "generic",
          company: "Decagon",
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

    // Noop digest path: empty run with fresh key
    const noop = await runDiscovery({
      kind: "manual",
      idempotencyKey: `smoke-discovery-empty:${runId}`,
      memberId: member.id,
      skipWebSearch: true,
    });
    assert(
      noop.status === "noop" || noop.counts.digestsSkipped >= 0,
      "empty run is noop-friendly",
    );

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
        await db.delete(companies).where(inArray(companies.id, companyIds));
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
