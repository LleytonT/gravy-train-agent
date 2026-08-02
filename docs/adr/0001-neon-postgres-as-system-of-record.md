# ADR 0001: Neon Postgres as the system of record

Status: accepted for the target architecture.

## Context

The prototype stores shared data in SQLite/libSQL and member state in a Markdown file. Local files become ephemeral on Vercel, the schema has no migration history, and the target product needs multi-member identity, conversations, evidence relationships, audit history, full-text retrieval, and potentially vector search.

## Decision

Use Neon Postgres provisioned through the Vercel Marketplace, accessed through the Neon serverless driver and Drizzle. Commit migrations and require a production database URL. Use Upstash only for short-lived coordination when a concrete locking, deduplication, or rate-limit need appears.

## Alternatives considered

- **Keep Turso/libSQL:** lowest migration cost, but weaker fit for the relational and retrieval roadmap and easier to continue accidental local-file fallbacks.
- **Supabase:** capable Postgres with auth, realtime, and storage, but those bundled surfaces duplicate separately selected concerns and increase platform coupling.
- **Convex:** excellent reactive data, but introduces another server-function and workflow model beside Eve.
- **PlanetScale:** strong operational database, but less direct fit for Postgres full-text and vector features.

## Consequences

- The current database client, schema, bootstrap SQL, and production seed behavior must be replaced.
- Provider provisioning must happen before implementation.
- Local development needs a documented database branch or equivalent isolated database.
- Relational constraints and row ownership become enforceable and testable.
