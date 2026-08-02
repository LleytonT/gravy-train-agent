# Evidence-backed discovery pipeline

GS-007 replaces free-form nightly tool chaining with one orchestrator seam.

## Seam

```ts
import { runDiscovery } from "./agent/lib/discovery/run.js";

await runDiscovery({
  kind: "schedule" | "manual" | "retry",
  idempotencyKey: "nightly:2026-08-02",
  memberId?: string,
  skipWebSearch?: boolean,
  limits?: { maxSourceItems, maxWebSearches, maxModelCalls },
});
```

Eve schedule `nightly_scout` and `pnpm test:discovery` share this method.

## Scoring migration

| Version | Behavior |
| --- | --- |
| `scoring.ts@v1` | Existing deterministic `scoreCompany` in `agent/lib/scoring.ts` (timing / territory / talent / drag), plus `job_alert_listing` as a concurrent/immediate hiring signal for inbound alerts. Regression: `pnpm test:scoring`. |

Opportunities store `score_version`, `score_inputs`, and an evidence-citing `rationale`.

## Candidate role kinds

`advertised` · `rumored` · `inferred` — stored on `candidate_roles.kind`. Inbound job alerts produce `advertised`.

## Limits

Default: 50 source items, 5 web searches, 20 model calls per run. Exceeding a limit throws an observable error from `LimitTracker`.

## Verification

```bash
pnpm db:migrate
pnpm test:scoring      # scoring.ts@v1 regression
pnpm test:discovery    # claim/retry, constraints, evidence, noop digests
pnpm typecheck
```
