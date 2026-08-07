---
description: Use when the nightly_scout schedule fires or the user asks how discovery runs. The schedule itself calls runDiscovery — do not re-drive the free-form tool chain.
---

# Nightly discovery pipeline (GS-007)

Production orchestration is **deterministic TypeScript**: `runDiscovery` in `agent/lib/discovery/run.ts`, invoked by `agent/schedules/nightly_scout.ts`.

Do **not** manually chain `get_new_feed_items → classify → save_signal → create_opportunity` for the nightly pass. That prototype path remains only for ad-hoc chat debugging against legacy `raw_items`.

## What the orchestrator does

1. Claim `discovery_runs` by idempotency key (retries do not duplicate work).
2. Process unprocessed `source_items` (job listings from GS-006 inbound).
3. Upsert signals with `signal_sources` citations + candidate roles (`advertised` / `rumored` / `inferred`).
4. Refresh `company_dossiers` for affected companies (web search ≤ limit).
5. Score with `scoring.ts` (`SCORE_VERSION = scoring.ts@v1`), enforce hard career-profile constraints, upsert opportunities + `opportunity_evidence`.
6. Deliver a digest only for material changes (`digest_deliveries`); otherwise skip — never pad.
7. Persist structured outcome on the run row.

## Specialist subagents (interactive / enrichment)

- `job_alert_analyst` — extract roles from alerts
- `company_researcher` — bounded public research (`search_web`)
- `fit_analyst` — constraint-aware fit rationale citing signal ids

The orchestrator calls the TypeScript analyst modules directly so the model does not decide which DB rows succeed.

## Manual trigger

```bash
pnpm exec tsx -e "import { runDiscovery } from './agent/lib/discovery/run.ts'; console.log(await runDiscovery({ kind: 'manual', idempotencyKey: 'dev:'+Date.now(), skipWebSearch: true }))"
pnpm test:discovery
```
