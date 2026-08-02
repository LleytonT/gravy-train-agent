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

`advertised` · `rumored` · `inferred` — stored on `candidate_roles.kind`.

- Inbound job alerts → `advertised`
- Company research hiring language → `inferred`
- Rumor / “heard they’re hiring” language → `rumored`

## Limits

Default: 50 source items, 5 web searches, 20 model calls per run.

- `maxSourceItems` is enforced as a SQL `LIMIT` on the unprocessed queue.
- Exceeding `maxWebSearches` or `maxModelCalls` throws an observable error from `LimitTracker` (analysts record model-call budget even on the deterministic path).

Failed runs leave source items unprocessed so a reclaim/retry can finish opportunities and digests.

## Verification

```bash
pnpm db:migrate
pnpm test:scoring      # scoring.ts@v1 regression
pnpm test:discovery    # claim/retry, constraints, evidence, noop digests
pnpm typecheck
```
