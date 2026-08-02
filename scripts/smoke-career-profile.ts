#!/usr/bin/env npx tsx
/**
 * GS-003 smoke: structured career profile precedence, resume ingest, feedback.
 */
import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { inArray } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

const { ensureSchema, getDb } = await import("../agent/lib/db/client.js");
const {
  appendInferredPreference,
  applyExplicitProfileChanges,
  getMemberContextSnapshot,
  ingestResumeText,
  setExplicitPreference,
} = await import("../agent/lib/career-profile.js");
const { upsertMemberFromExternalAuth } = await import(
  "../agent/lib/identity.js"
);
const {
  careerProfiles,
  feedbackEvents,
  members,
  preferences,
} = await import("../agent/lib/db/schema.js");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  await ensureSchema();
  const db = getDb();
  const runId = randomUUID();
  let memberId: string | null = null;

  try {
    const member = await upsertMemberFromExternalAuth({
      externalAuthId: `career-smoke-${runId}`,
      email: `career-${runId}@example.invalid`,
      displayName: "Career Smoke",
    });
    memberId = member.id;

    await applyExplicitProfileChanges(memberId, {
      name: "Alex Scout",
      currentTitle: "Sales Engineer",
      currentCompany: "Vercel",
      location: "Sydney, Australia",
      interests: ["AI infra", "developer tools"],
      constraints: {
        remotePreference: "hybrid",
        locations: ["Australia", "Singapore"],
      },
      goals: {
        targetTitles: ["Field Engineer", "Deployment Engineer"],
      },
      messaging: {
        consentUpdates: true,
        telegramUsername: "alexscout",
      },
    });

    await appendInferredPreference({
      memberId,
      key: "preferHyperscalers",
      value: true,
      confidence: 0.4,
      sourceRef: "smoke-inferred",
    });

    let snapshot = await getMemberContextSnapshot(memberId);
    assert(
      snapshot.preferences.preferHyperscalers === true,
      "inferred preference should apply when no explicit value exists",
    );

    await setExplicitPreference(memberId, "preferHyperscalers", false);
    await setExplicitPreference(memberId, "avoidSeedStage", true);
    await setExplicitPreference(memberId, "ignoreCategories", ["agency"]);

    snapshot = await getMemberContextSnapshot(memberId);
    assert(
      snapshot.preferences.preferHyperscalers === false,
      "explicit preference must override inferred",
    );
    assert(
      snapshot.preferences.avoidSeedStage === true,
      "explicit avoidSeedStage missing",
    );
    assert(
      snapshot.preferences.ignoreCategories.includes("agency"),
      "ignoreCategories not resolved",
    );
    assert(
      snapshot.identity.currentTitle === "Sales Engineer",
      "identity title missing",
    );
    assert(
      snapshot.identity.roleFamily === "sales_engineer",
      `unexpected role family ${snapshot.identity.roleFamily}`,
    );
    assert(
      snapshot.document.messaging?.telegramUsername === "alexscout",
      "messaging not stored on profile document",
    );
    assert(
      snapshot.modelContextMarkdown.includes("Career Identity"),
      "model context projection missing",
    );

    snapshot = await ingestResumeText({
      memberId,
      text: "Alex Scout\nSales Engineer at Vercel\nBuilt APAC solutions for AI infra buyers across Australia and Singapore.",
      fileName: "alex.txt",
      source: "paste",
    });
    assert(snapshot.document.resume?.fileName === "alex.txt", "resume missing");
    assert(
      snapshot.recentFeedback.some((event) => event.kind === "resume_ingested"),
      "resume feedback missing",
    );
    assert(
      snapshot.recentFeedback.some((event) => event.kind === "preference_set"),
      "preference feedback missing",
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          memberId,
          roleFamily: snapshot.identity.roleFamily,
          preferHyperscalers: snapshot.preferences.preferHyperscalers,
          feedback: snapshot.recentFeedback.length,
        },
        null,
        2,
      ),
    );
  } finally {
    if (memberId) {
      await db
        .delete(feedbackEvents)
        .where(inArray(feedbackEvents.memberId, [memberId]));
      await db
        .delete(preferences)
        .where(inArray(preferences.memberId, [memberId]));
      await db
        .delete(careerProfiles)
        .where(inArray(careerProfiles.memberId, [memberId]));
      await db.delete(members).where(inArray(members.id, [memberId]));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
