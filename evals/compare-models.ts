#!/usr/bin/env npx tsx
/**
 * Multi-model classify comparison matrix.
 *
 * Sweeps CLASSIFY_MODELS (comma-separated Gateway ids) against the same gold
 * fixtures so you can pick a default LLM or validate a fine-tuned model.
 *
 *   CLASSIFY_MODELS=anthropic/claude-haiku-4.5,openai/gpt-5-mini pnpm eval:compare
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
config();

import {
  classifyBatch,
  type ClassifyItem,
  type ExtractedSignal,
} from "../agent/lib/classify.js";
import {
  CLASSIFY_MODEL,
  parseModelList,
} from "../agent/lib/models.js";
import { scoreClassifyCase, type ClassifyExpected } from "./lib/metrics.js";

type GoldFile = {
  cases: Array<{
    id: string;
    item: ClassifyItem;
    expected: ClassifyExpected;
  }>;
};

type ModelResult = {
  model: string;
  passed: number;
  total: number;
  accuracy: number;
  latencyMs: number;
  signalsReturned: number;
  failures: Array<{ id: string; reasons: string[] }>;
};

const here = dirname(fileURLToPath(import.meta.url));

async function evalModel(
  model: string,
  gold: GoldFile,
): Promise<ModelResult> {
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

  const failures: ModelResult["failures"] = [];
  let passed = 0;
  for (const testCase of gold.cases) {
    const predicted = byItem.get(testCase.item.id) ?? [];
    const scored = scoreClassifyCase(
      testCase.id,
      predicted,
      testCase.expected,
    );
    if (scored.ok) {
      passed += 1;
    } else {
      failures.push({ id: testCase.id, reasons: scored.reasons });
    }
  }

  return {
    model,
    passed,
    total: gold.cases.length,
    accuracy: gold.cases.length === 0 ? 0 : passed / gold.cases.length,
    latencyMs,
    signalsReturned: allSignals.length,
    failures,
  };
}

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error("AI_GATEWAY_API_KEY is required for model comparison.");
    process.exit(2);
  }

  const models = parseModelList(process.env.CLASSIFY_MODELS, [CLASSIFY_MODEL]);
  const gold = JSON.parse(
    readFileSync(resolve(here, "fixtures/classify-gold.json"), "utf8"),
  ) as GoldFile;

  console.log(`Comparing ${models.length} classify model(s) on ${gold.cases.length} cases…`);

  const results: ModelResult[] = [];
  for (const model of models) {
    console.log(`\n→ ${model}`);
    const result = await evalModel(model, gold);
    results.push(result);
    console.log(
      `  accuracy=${(result.accuracy * 100).toFixed(1)}% (${result.passed}/${result.total}) latency=${result.latencyMs}ms`,
    );
    for (const failure of result.failures) {
      console.log(`  FAIL ${failure.id}: ${failure.reasons.join("; ")}`);
    }
  }

  results.sort((a, b) => b.accuracy - a.accuracy || a.latencyMs - b.latencyMs);
  const ranking = results.map((r, index) => ({
    rank: index + 1,
    model: r.model,
    accuracy: r.accuracy,
    latencyMs: r.latencyMs,
  }));

  const outDir = resolve(here, "../data/evals");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `compare-${Date.now()}.json`);
  writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), ranking, results }, null, 2),
  );

  console.log("\nRanking:");
  console.log(JSON.stringify({ ranking, report: outPath }, null, 2));

  if (results.some((r) => r.passed < r.total)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
