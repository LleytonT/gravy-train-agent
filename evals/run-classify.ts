#!/usr/bin/env npx tsx
/**
 * Classification eval against gold fixtures.
 *
 * Requires AI_GATEWAY_API_KEY. Model defaults to CLASSIFY_MODEL.
 *
 *   pnpm eval:classify
 *   CLASSIFY_MODEL=openai/gpt-5-mini pnpm eval:classify
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
config();

import {
  classifyBatch,
  type ClassifyItem,
  type ExtractedSignal,
} from "../agent/lib/classify.js";
import { resolveModel } from "../agent/lib/models.js";
import { scoreClassifyCase, type ClassifyExpected } from "./lib/metrics.js";
import { EvalReporter } from "./lib/report.js";

type GoldFile = {
  version: number;
  cases: Array<{
    id: string;
    item: ClassifyItem;
    expected: ClassifyExpected;
  }>;
};

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const model = resolveModel("classify", process.env.EVAL_CLASSIFY_MODEL);
  const reporter = new EvalReporter("classify");
  reporter.meta = { model };

  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error(
      "AI_GATEWAY_API_KEY is required for classify evals. Skipping live classify.",
    );
    console.error(
      "Tip: run `pnpm eval:scoring` (deterministic) or export fine-tune data with `pnpm eval:export`.",
    );
    process.exit(2);
  }

  const gold = JSON.parse(
    readFileSync(resolve(here, "fixtures/classify-gold.json"), "utf8"),
  ) as GoldFile;

  const items = gold.cases.map((c) => c.item);
  const started = Date.now();
  const allSignals = await classifyBatch(items, { model });
  const latencyMs = Date.now() - started;

  const byItem = new Map<string, ExtractedSignal[]>();
  for (const signal of allSignals) {
    const list = byItem.get(signal.rawItemId) ?? [];
    list.push(signal);
    byItem.set(signal.rawItemId, list);
  }

  let passedCases = 0;
  for (const testCase of gold.cases) {
    const predicted = byItem.get(testCase.item.id) ?? [];
    const scored = scoreClassifyCase(
      testCase.id,
      predicted,
      testCase.expected,
    );
    reporter.check(
      testCase.id,
      scored.ok,
      scored.ok
        ? `${scored.predictedCount} signal(s)`
        : scored.reasons.join("; "),
    );
    if (scored.ok) {
      passedCases += 1;
    }
  }

  reporter.meta = {
    model,
    latencyMs,
    cases: gold.cases.length,
    caseAccuracy: passedCases / gold.cases.length,
    signalsReturned: allSignals.length,
  };

  reporter.finish();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
