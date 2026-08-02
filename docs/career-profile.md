# Career profile module

Authoritative member personalization state lives in Neon Postgres via
`agent/lib/career-profile.ts`. Markdown under `agent/sandbox/workspace/memory/`
is no longer the source of truth.

## Interface

| Function | Purpose |
| --- | --- |
| `getMemberContextSnapshot(memberId)` | Read identity, preferences, messaging, résumé, recent feedback, and a model-context Markdown projection |
| `applyExplicitProfileChanges(memberId, patch)` | Upsert career facts, goals, constraints, interests, messaging |
| `setExplicitPreference(memberId, key, value)` | Store an explicit preference and append a feedback event |
| `appendInferredPreference(...)` | Store an inferred preference with confidence + sourceRef |
| `recordFeedback(...)` | Append-only correction / disposition events |
| `ingestResumeText(...)` | Explicit résumé paste/upload storage |

## Precedence

Active preference rows resolve as **explicit > imported > inferred**.
Inferred values never silently override what the member set.

## Tools

- `update_user_profile` — structured read/patch + preference corrections
- `ingest_linkedin_profile` — career identity fields (manual / described)
- `ingest_resume` — résumé text the member explicitly provided
- `save_messaging_destination` — Telegram destination on the profile document
- `recommend_roles` / `score_company` / `find_outreach_targets` — consume the snapshot

## Verification

```bash
pnpm test:career-profile
pnpm test:auth
pnpm typecheck
```
