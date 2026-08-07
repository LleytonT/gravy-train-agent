#!/usr/bin/env npx tsx
/**
 * Run all offline (no API key) eval suites.
 *
 *   pnpm eval
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const suites = ["run-scoring.ts", "run-digest.ts", "run-chat.ts"] as const;

let failed = 0;
for (const suite of suites) {
  console.log(`\n=== ${suite} ===`);
  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", resolve(here, suite)],
    { stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) {
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed} offline suite(s) failed`);
  process.exit(1);
}

console.log("\nAll offline evals passed");
