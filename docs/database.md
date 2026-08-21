# Database development

Gravy Scout uses Neon Postgres with Drizzle. The Vercel Marketplace resource is named `gravy-scout`, runs in `syd1`, uses Neon's free plan, and is connected to the Vercel project's production, preview, and development environments. Neon Auth is disabled because member authentication is handled separately.

## Environment

Vercel provides:

- `DATABASE_URL` — pooled runtime connection used by the application and Eve.
- `DATABASE_URL_UNPOOLED` — direct connection used by Drizzle migrations.

Pull development variables without printing their values:

```bash
pnpm dlx vercel@latest link --yes \
  --scope lleytons-projects-cacece87 \
  --project gravy-train-agent
pnpm dlx vercel@latest env pull .env.local --yes
```

Never commit `.env.local` or paste connection strings into issues, logs, or documentation.

## Schema workflow

Edit `agent/lib/db/schema.ts`, then generate and review a migration:

```bash
pnpm db:generate
git diff -- drizzle/
```

Apply committed migrations:

```bash
pnpm db:migrate
```

Application startup never creates tables. Missing or non-Postgres `DATABASE_URL` values fail with a configuration error when database access begins. Module import remains build-safe because the client is initialized lazily.

## Development fixtures

Demo fixtures are opt-in:

```bash
pnpm seed
pnpm exec tsx scripts/verify-dossier.ts
```

No production cold start calls the seed script. The script is idempotent for companies, roles, targets, and source URLs, but it may add repeated historical signals; use it only on disposable development data.

## Verification

```bash
pnpm db:migrate       # also proves migration replay is safe
pnpm test:database    # creates two members, verifies isolated rows, cleans up
pnpm test:auth        # identity upserts + Eve anonymous auth removed
pnpm test:career-profile
pnpm test:conversation # canonical conversation bridge + idempotency
pnpm test:telegram-link # secure Telegram link tokens + revocation
pnpm test:telegram-cold-start # unknown Telegram user IDs talk; website-gate cannot regress
pnpm test:inbound     # job-alert parse fixtures, webhook verify, ingest dedupe
pnpm test:discovery   # discovery claim/retry, evidence, constraints, digests
pnpm test:scoring
pnpm typecheck
pnpm build
pnpm build:eve
```

`test:database` writes only uniquely named smoke rows and removes them in a `finally` block.

## Transition tables

The migration includes the existing `raw_items`, role, outreach, signal, opportunity, and run-log tables so current Eve tools remain operational. New work should use the member, profile, conversation, source-item, evidence, discovery-run, and delivery tables. The remaining prototype modules are migrated by the later GS tickets.
