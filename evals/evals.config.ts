import { defineEvalConfig } from "eve/evals";

/**
 * Deterministic fixture evals omit a judge model.
 * Soft LLM-as-judge cases may set `judge` per-eval when AI Gateway is available.
 */
export default defineEvalConfig({
  // Fixture store is process-global on the agent server — serialize cases.
  maxConcurrency: 1,
  timeoutMs: 60_000,
});
