# GS-007 — Evidence-backed discovery pipeline

Blocked by: GS-003 and GS-006.

## Goal

Turn job alerts and public company evidence into explainable, member-specific opportunities through an idempotent discovery run.

## Scope

- Replace free-form nightly orchestration with a deterministic TypeScript run state machine.
- Add specialist Eve subagents for job extraction, company research, and fit analysis.
- Add reliable public search/news/company-source connections with explicit limits.
- Store signals with source citations and observed times.
- Refresh shared company dossiers only when affected.
- Generate, score, and upsert member opportunities with score version and inputs.
- Deliver a digest only for new or materially changed opportunities.
- Add run claims, retries, error states, and delivery idempotency.

## Interface

One orchestrator method accepts a run trigger and returns a structured run outcome. Eve schedules and developer commands call the same seam.

## Acceptance checks

- Retrying the same run does not duplicate signals, opportunities, or digests.
- Every opportunity rationale cites persisted evidence.
- Advertised, rumored, and inferred candidate roles are labeled distinctly.
- Hard member constraints can exclude a high company score.
- No meaningful changes produces no padded notification.
- Model and source/tool limits are enforced and observable.
- Existing scoring behavior has an explicit migration or regression comparison.

## Not in scope

Autonomous outreach, application submission, or unsupported social scraping.
