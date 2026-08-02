# GS-001 — Production data foundation

Status: implemented.

## Goal

Replace ephemeral SQLite/libSQL state with a migration-managed Neon Postgres foundation that can safely hold multiple members.

## Scope

- Provision Neon through the Vercel Marketplace before application code is changed.
- Add the Neon serverless driver and Postgres Drizzle schema/configuration.
- Create the initial identity, conversation, profile, source, evidence, opportunity, run, and delivery tables described in the target architecture.
- Add committed migrations and documented local/deploy migration commands.
- Provide a lazy database accessor that does not evaluate missing environment variables during build.
- Migrate reusable seed fixtures without seeding production automatically.
- Remove production fallback to `/tmp`; fail fast with a clear configuration error.

## Interface

Expose one database module for application and agent modules. Callers must not know driver configuration or create clients directly.

## Acceptance checks

- A clean database migrates successfully.
- `next build`, Eve build, and typecheck pass with documented build-time configuration.
- Two seeded members can own distinct profiles, conversations, and opportunities.
- Production mode without a database URL fails before serving member traffic.
- A cold start does not recreate demo data or lose persisted rows.
- Existing scoring smoke tests still pass or have an explicitly equivalent replacement.

## Not in scope

Authentication provider wiring, Telegram linking, ingestion, or visual changes.

## Implementation notes

- The Vercel Marketplace resource is documented in `docs/database.md`.
- Existing scoring/capture tables remain as transition tables so the current Eve tools continue to work.
- Legacy opportunities may temporarily have no `member_id`; GS-002 must make member context mandatory before production member traffic.
