/**
 * Eval fixture mode — deterministic local agent for Eve evals (GS-009).
 *
 * When GRAVY_SCOUT_EVAL_FIXTURE=1, the agent uses mockModel and an in-memory
 * store so hard-gate evals run without AI Gateway or Neon credentials.
 */

export function isEvalFixture(): boolean {
  const raw = process.env.GRAVY_SCOUT_EVAL_FIXTURE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Stable member id used by local-dev auth under fixture mode. */
export const FIXTURE_MEMBER_ID = "member_eval_fixture";
