#!/usr/bin/env npx tsx
/**
 * Digest rubric eval (deterministic structural checks on sample digests).
 *
 *   pnpm eval:digest
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EvalReporter } from "./lib/report.js";

type DigestCase = {
  id: string;
  sampleDigest: string;
  rubric: {
    maxChars: number;
    mustMentionCompanies?: string[];
    mustMarkUrgent?: boolean;
    forbidMarkdownHeadings?: boolean;
    forbidPadding?: boolean;
    minMissedBullets?: number;
    maxMissedBullets?: number;
  };
};

type DigestFile = { version: number; cases: DigestCase[] };

const here = dirname(fileURLToPath(import.meta.url));

function countBullets(text: string): number {
  return text
    .split("\n")
    .filter((line) => /^\s*[-*•]/.test(line) || /^\s*\d+\./.test(line)).length;
}

function main() {
  const file = JSON.parse(
    readFileSync(resolve(here, "fixtures/digest-cases.json"), "utf8"),
  ) as DigestFile;
  const reporter = new EvalReporter("digest");

  for (const testCase of file.cases) {
    const digest = testCase.sampleDigest.trim();
    const { rubric } = testCase;

    reporter.check(
      `${testCase.id}/maxChars`,
      digest.length <= rubric.maxChars,
      digest.length <= rubric.maxChars
        ? `${digest.length} chars`
        : `${digest.length} chars (max ${rubric.maxChars})`,
    );

    if (rubric.mustMentionCompanies) {
      for (const company of rubric.mustMentionCompanies) {
        const ok = digest.toLowerCase().includes(company.toLowerCase());
        reporter.check(
          `${testCase.id}/mention:${company}`,
          ok,
          ok ? undefined : `missing "${company}"`,
        );
      }
    }

    if (rubric.mustMarkUrgent === true) {
      const ok = /urgent/i.test(digest);
      reporter.check(
        `${testCase.id}/urgent`,
        ok,
        ok ? undefined : "expected urgent marker",
      );
    }

    if (rubric.mustMarkUrgent === false) {
      const ok = !/\burgent\b/i.test(digest);
      reporter.check(
        `${testCase.id}/no-urgent`,
        ok,
        ok ? undefined : "digest-only should not be marked urgent",
      );
    }

    if (rubric.forbidMarkdownHeadings) {
      const ok = !/^#{1,6}\s/m.test(digest);
      reporter.check(
        `${testCase.id}/no-md-headings`,
        ok,
        ok ? undefined : "WhatsApp digests must not use markdown headings",
      );
    }

    if (rubric.forbidPadding) {
      const ok = digest.length <= 200 && countBullets(digest) <= 1;
      reporter.check(
        `${testCase.id}/no-padding`,
        ok,
        ok ? undefined : "empty nights should be one short line",
      );
    }

    if (rubric.minMissedBullets !== undefined) {
      const bullets = countBullets(digest);
      reporter.check(
        `${testCase.id}/minBullets`,
        bullets >= rubric.minMissedBullets,
        bullets >= rubric.minMissedBullets
          ? undefined
          : `got ${bullets}, want >= ${rubric.minMissedBullets}`,
      );
    }

    if (rubric.maxMissedBullets !== undefined) {
      const bullets = countBullets(digest);
      reporter.check(
        `${testCase.id}/maxBullets`,
        bullets <= rubric.maxMissedBullets,
        bullets <= rubric.maxMissedBullets
          ? undefined
          : `got ${bullets}, want <= ${rubric.maxMissedBullets}`,
      );
    }
  }

  reporter.meta = { cases: file.cases.length };
  const failed = reporter.finish();
  if (failed === 0) {
    console.log("digest eval ok");
  }
}

main();
