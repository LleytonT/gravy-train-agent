#!/usr/bin/env npx tsx
/**
 * Chat / tool-use scenario checks.
 *
 * Offline (default): validates fixture shape + documents expected tools.
 * Live (EVAL_LIVE=1): POSTs each prompt to the Eve session API and checks
 * that expected tool names appear in the stream.
 *
 *   pnpm eval:chat
 *   EVAL_LIVE=1 EVAL_BASE_URL=http://127.0.0.1:2000 pnpm eval:chat
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
config();

import { EvalReporter } from "./lib/report.js";

type ChatCase = {
  id: string;
  prompt: string;
  expectedToolsAnyOf: string[];
  forbiddenBehaviors?: string[];
  notes?: string;
};

type ChatFile = { version: number; cases: ChatCase[] };

const here = dirname(fileURLToPath(import.meta.url));

async function runLiveCase(
  baseUrl: string,
  testCase: ChatCase,
): Promise<{ ok: boolean; detail: string; tools: string[] }> {
  const createRes = await fetch(`${baseUrl.replace(/\/$/, "")}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: testCase.prompt }),
  });

  if (!createRes.ok) {
    return {
      ok: false,
      detail: `session create ${createRes.status}`,
      tools: [],
    };
  }

  const created = (await createRes.json()) as { sessionId?: string; id?: string };
  const sessionId = created.sessionId ?? created.id;
  if (!sessionId) {
    return { ok: false, detail: "no sessionId in response", tools: [] };
  }

  const streamRes = await fetch(
    `${baseUrl.replace(/\/$/, "")}/eve/v1/session/${sessionId}/stream`,
  );
  if (!streamRes.ok || !streamRes.body) {
    return {
      ok: false,
      detail: `stream ${streamRes.status}`,
      tools: [],
    };
  }

  const text = await streamRes.text();
  const tools = new Set<string>();
  // Best-effort extraction across SSE / JSONL shapes.
  const toolPatterns = [
    /"toolName"\s*:\s*"([^"]+)"/g,
    /"name"\s*:\s*"((?:get_|list_|update_|score_|create_|classify_|save_|mark_|log_|send_|search_)[^"]+)"/g,
    /tool[_-]?call[^a-z]+([a-z_]+)/gi,
  ];
  for (const pattern of toolPatterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) {
        tools.add(match[1]);
      }
    }
  }

  const toolList = [...tools];
  const hit = testCase.expectedToolsAnyOf.some((name) => tools.has(name));
  return {
    ok: hit,
    detail: hit
      ? `tools=[${toolList.join(", ")}]`
      : `expected one of [${testCase.expectedToolsAnyOf.join(", ")}], saw [${toolList.join(", ") || "none"}]`,
    tools: toolList,
  };
}

async function main() {
  const file = JSON.parse(
    readFileSync(resolve(here, "fixtures/chat-scenarios.json"), "utf8"),
  ) as ChatFile;
  const reporter = new EvalReporter("chat");
  const live = process.env.EVAL_LIVE === "1";
  const baseUrl = process.env.EVAL_BASE_URL ?? "http://127.0.0.1:3000";

  for (const testCase of file.cases) {
    reporter.check(
      `${testCase.id}/fixture`,
      Boolean(testCase.prompt?.trim()) &&
        Array.isArray(testCase.expectedToolsAnyOf) &&
        testCase.expectedToolsAnyOf.length > 0,
      testCase.notes ?? "fixture ok",
    );

    if (!live) {
      continue;
    }

    try {
      const result = await runLiveCase(baseUrl, testCase);
      reporter.check(`${testCase.id}/live`, result.ok, result.detail);
    } catch (error) {
      reporter.check(
        `${testCase.id}/live`,
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  reporter.meta = {
    mode: live ? "live" : "offline",
    baseUrl: live ? baseUrl : undefined,
    cases: file.cases.length,
    note: live
      ? "Live tool extraction is best-effort against the Eve stream format."
      : "Set EVAL_LIVE=1 and start `pnpm dev:no-ui` to exercise the session API.",
  };

  const failed = reporter.finish();
  if (failed === 0) {
    console.log(live ? "chat live eval ok" : "chat fixture eval ok");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
