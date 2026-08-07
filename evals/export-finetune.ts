#!/usr/bin/env npx tsx
/**
 * Export classify gold fixtures as fine-tuning JSONL.
 *
 * Output mimics the live classify prompt (system + user) with the gold
 * structured signals as the assistant target. Point CLASSIFY_MODEL at the
 * resulting fine-tuned Gateway model id after training.
 *
 *   pnpm eval:export
 *   → data/evals/classify-finetune.jsonl
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  type ClassifyItem,
} from "../agent/lib/classify.js";
import type { ClassifyExpected } from "./lib/metrics.js";

type GoldCase = {
  id: string;
  item: ClassifyItem;
  expected: ClassifyExpected & {
    /** Optional explicit gold signals for supervised fine-tuning. */
    goldSignals?: Array<{
      company: string;
      signalType: string;
      direction: "positive" | "negative";
      strength: number;
      summary: string;
    }>;
  };
};

type GoldFile = { cases: GoldCase[] };

const here = dirname(fileURLToPath(import.meta.url));

function synthesizeGoldSignals(testCase: GoldCase) {
  if (testCase.expected.goldSignals) {
    return testCase.expected.goldSignals.map((signal) => ({
      rawItemId: testCase.item.id,
      ...signal,
    }));
  }

  if (!testCase.expected.mustExtract) {
    return [];
  }

  const company = testCase.expected.companiesAnyOf?.[0] ?? "Unknown";
  const signalType = testCase.expected.signalTypesAnyOf?.[0] ?? "expansion_signal";
  const direction = testCase.expected.direction ?? "positive";
  const strength = testCase.expected.minStrength ?? 3;

  return [
    {
      rawItemId: testCase.item.id,
      company,
      signalType,
      direction,
      strength,
      summary: testCase.item.excerpt.slice(0, 160),
    },
  ];
}

function main() {
  const gold = JSON.parse(
    readFileSync(resolve(here, "fixtures/classify-gold.json"), "utf8"),
  ) as GoldFile;

  const system = buildClassifySystemPrompt();
  const lines: string[] = [];
  const manifest: Array<{ id: string; signalCount: number }> = [];

  for (const testCase of gold.cases) {
    const signals = synthesizeGoldSignals(testCase);
    const record = {
      id: testCase.id,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: buildClassifyUserPrompt([testCase.item]),
        },
        {
          role: "assistant",
          content: JSON.stringify({ signals }),
        },
      ],
    };
    lines.push(JSON.stringify(record));
    manifest.push({ id: testCase.id, signalCount: signals.length });
  }

  const outDir = resolve(here, "../data/evals");
  mkdirSync(outDir, { recursive: true });
  const jsonlPath = resolve(outDir, "classify-finetune.jsonl");
  const manifestPath = resolve(outDir, "classify-finetune.manifest.json");
  writeFileSync(jsonlPath, `${lines.join("\n")}\n`, "utf8");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        cases: manifest.length,
        note: "Targets are synthesized from expected.* when goldSignals are absent. Replace with human-labeled signals before a real fine-tune.",
        manifest,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        cases: manifest.length,
        jsonl: jsonlPath,
        manifest: manifestPath,
        next: [
          "Review/replace synthesized assistant targets with human labels",
          "Train via your provider's fine-tune API",
          "Set CLASSIFY_MODEL=<fine-tuned-gateway-id>",
          "pnpm eval:classify && pnpm eval:compare",
        ],
      },
      null,
      2,
    ),
  );
}

main();
