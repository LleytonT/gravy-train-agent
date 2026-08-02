# GS-003 — Structured career profile and feedback

Blocked by: GS-001 and GS-002.

## Goal

Replace shared Markdown memory with a structured, member-owned career profile that preserves provenance and explicit preference precedence.

## Scope

- Model career facts, goals, constraints, preferences, and feedback events.
- Import the current onboarding fields without requiring LinkedIn.
- Support résumé text/file ingestion through an explicit member action.
- Expose a compact context snapshot for Eve instructions and tools.
- Replace profile and messaging Markdown writers with one profile module.
- Record preference corrections and opportunity dispositions append-only.
- Keep generated Markdown only as an optional model-context projection.

## Interface

The profile module can read a member context snapshot, apply explicit changes, append inferred preferences, and record feedback. It hides persistence and precedence rules.

## Acceptance checks

- Every profile row is member-scoped.
- Explicit preferences override inferred preferences.
- Every inferred value has source and confidence metadata.
- A correction is visible in the next agent turn on web and Telegram.
- The filesystem profile is no longer authoritative.
- Existing deterministic personalization can consume the new snapshot.

## Not in scope

Automated LinkedIn profile scraping or unrestricted mailbox import.
