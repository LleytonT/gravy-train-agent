#!/usr/bin/env npx tsx
/**
 * Deterministic scoring eval suite (no LLM / no API key).
 *
 *   pnpm test:scoring
 *   pnpm eval:scoring
 */
import { config } from "dotenv";
config();

import { scoreCompany } from "../agent/lib/scoring.js";
import { parsePreferences } from "../agent/lib/profile.js";
import { SCORING_CASES } from "./fixtures/scoring-cases.js";
import { EvalReporter } from "./lib/report.js";

function main() {
  const reporter = new EvalReporter("scoring");

  for (const testCase of SCORING_CASES) {
    const result = scoreCompany(testCase.signals, testCase.prefs);
    const { expect } = testCase;

    if (expect.pingTier !== undefined) {
      reporter.check(
        `${testCase.id}/pingTier`,
        result.pingTier === expect.pingTier,
        result.pingTier === expect.pingTier
          ? undefined
          : `got ${result.pingTier}, want ${expect.pingTier}`,
      );
    }
    if (expect.minScore !== undefined) {
      reporter.check(
        `${testCase.id}/minScore`,
        result.score >= expect.minScore,
        result.score >= expect.minScore
          ? `score=${result.score}`
          : `got ${result.score}, want >= ${expect.minScore}`,
      );
    }
    if (expect.maxScore !== undefined) {
      reporter.check(
        `${testCase.id}/maxScore`,
        result.score <= expect.maxScore,
        result.score <= expect.maxScore
          ? `score=${result.score}`
          : `got ${result.score}, want <= ${expect.maxScore}`,
      );
    }
    if (expect.minTiming !== undefined) {
      reporter.check(
        `${testCase.id}/minTiming`,
        result.timing >= expect.minTiming,
        result.timing >= expect.minTiming
          ? undefined
          : `got ${result.timing}, want >= ${expect.minTiming}`,
      );
    }
    if (expect.maxTiming !== undefined) {
      reporter.check(
        `${testCase.id}/maxTiming`,
        result.timing <= expect.maxTiming,
        result.timing <= expect.maxTiming
          ? undefined
          : `got ${result.timing}, want <= ${expect.maxTiming}`,
      );
    }
    if (expect.minTerritory !== undefined) {
      reporter.check(
        `${testCase.id}/minTerritory`,
        result.territory >= expect.minTerritory,
        result.territory >= expect.minTerritory
          ? undefined
          : `got ${result.territory}, want >= ${expect.minTerritory}`,
      );
    }
    if (expect.minTalent !== undefined) {
      reporter.check(
        `${testCase.id}/minTalent`,
        result.talent >= expect.minTalent,
        result.talent >= expect.minTalent
          ? undefined
          : `got ${result.talent}, want >= ${expect.minTalent}`,
      );
    }
    if (expect.minNegativeDrag !== undefined) {
      reporter.check(
        `${testCase.id}/minNegativeDrag`,
        result.negativeDrag >= expect.minNegativeDrag,
        result.negativeDrag >= expect.minNegativeDrag
          ? undefined
          : `got ${result.negativeDrag}, want >= ${expect.minNegativeDrag}`,
      );
    }
    if (expect.rationaleIncludes) {
      const joined = result.rationale.join(" ");
      for (const needle of expect.rationaleIncludes) {
        const ok = joined.toLowerCase().includes(needle.toLowerCase());
        reporter.check(
          `${testCase.id}/rationale:${needle}`,
          ok,
          ok ? undefined : `rationale missing "${needle}"`,
        );
      }
    }
  }

  // Profile preference parsing — used by score_company prefs path.
  const profile = parsePreferences(`
## Preferences
- preferHyperscalers: true
- avoidSeedStage: true
- ignoreCategories: recruiting, agencies
`);
  reporter.check(
    "profile/preferHyperscalers",
    profile.preferHyperscalers === true,
  );
  reporter.check("profile/avoidSeedStage", profile.avoidSeedStage === true);
  reporter.check(
    "profile/ignoreCategories",
    profile.ignoreCategories.join(",") === "recruiting,agencies",
    `got ${profile.ignoreCategories.join(",")}`,
  );

  reporter.meta = { cases: SCORING_CASES.length };
  const failed = reporter.finish();
  if (failed === 0) {
    console.log("scoring eval ok");
  }
}

main();
