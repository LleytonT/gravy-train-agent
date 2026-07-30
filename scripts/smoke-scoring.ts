#!/usr/bin/env npx tsx
/**
 * @deprecated Prefer `pnpm eval:scoring` / `pnpm test:scoring`.
 * Thin alias so older docs still work.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "pnpm",
  ["exec", "tsx", "evals/run-scoring.ts"],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
