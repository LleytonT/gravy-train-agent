# Gravy Scout

Personalized opportunity-intelligence agent built on [Eve](https://eve.dev), Vercel’s filesystem-first agent framework.

Gravy Scout learns a member’s background and goals, ingests job-board alerts through a unique inbound email address, researches public expansion and hiring evidence, and surfaces advertised, likely, and non-obvious opportunities with citations. It is not a job-board scraper, auto-application bot, or autonomous outreach tool.

The original single-user prototype (shared Markdown profile, browser-local chat, anonymous Eve HTTP, Playwright LinkedIn/X capture as a member journey) has been replaced. Tickets **GS-001 through GS-009** are implemented on `main`.

Start with:

1. [`CONTEXT.md`](./CONTEXT.md) — canonical domain language
2. [`docs/specs/gravy-scout-v1.md`](./docs/specs/gravy-scout-v1.md) — product specification
3. [`docs/architecture/target-architecture.md`](./docs/architecture/target-architecture.md) — selected architecture
4. [`docs/tickets/README.md`](./docs/tickets/README.md) — tracer-bullet map (all slices landed)

## Where the project stands

| Slice | Status |
| --- | --- |
| GS-001 Neon Postgres system of record | Shipped |
| GS-002 Member identity (Telegram user ID + member session) | Shipped |
| GS-003 Structured career profile + preference provenance | Shipped |
| GS-004 Canonical conversation (web ↔ Telegram timeline) | Shipped |
| GS-005 Secure Telegram linking, quiet hours, digest delivery | Shipped |
| GS-006 Resend inbound job-alert email | Shipped |
| GS-007 Deterministic discovery orchestrator + subagents | Shipped |
| GS-008 Public product pages + `/app` workspace (Today / Opportunities / Conversation / Profile) | Shipped |
| GS-009 Eve eval fixture suite | Shipped |

**Member journey today:** text the Telegram bot (creates the member) or public `/` → `/get-started` (career snapshot, goals, match preview with no login) → Telegram Login Widget to enter `/app` → inbound alert address on Profile → nightly discovery → ranked opportunities with evidence, fit, and disposition.

Web and Telegram keep **separate Eve sessions** (Eve continuation tokens are channel-local). Members see **one Postgres conversation**. Career profile, preferences, opportunities, and messaging consent live in Neon — not in `user-profile.md` or browser storage.

Still outside v1 / not built:

- Account export and deletion
- Broad mailbox OAuth (deferred; inbound forwarding is the path)
- Autonomous apply / send / post
- Member-facing LinkedIn or X scraping (local Playwright remains a **developer-only** experiment)
- Native mobile apps
- CI workflow for evals (commands exist; no `.github` workflow yet)

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node 24 (`engines.node: 24.x`; Eve hard-fails on older Node) |
| Web | Next.js 16 App Router + `withEve` (same-origin `/eve/v1/*`) |
| UI | shadcn/ui + Tailwind 4 |
| Agent | Eve (`agent/` filesystem: tools, skills, channels, schedules, subagents, evals) |
| Models | Vercel AI Gateway — Sonnet-class for chat/synthesis (`AGENT_MODEL`), Haiku for batch classify (`CLASSIFY_MODEL`) |
| DB | Neon Postgres + Drizzle migrations (`DATABASE_URL` pooled, `DATABASE_URL_UNPOOLED` for migrate) |
| Auth | **Telegram user ID** (text the bot or Login Widget); Eve: `memberSessionAuth` → Vercel OIDC → local-dev. No Clerk. No anonymous `none()`. |
| Email | Resend inbound on `gravy.sh` (`gs_…@gravy.sh` per member) — job-alert receiving, not login |
| Messaging | Telegram (primary chat + digests). Other channels later. |
| Capture | Playwright against a local browser profile — **not** part of the member product |

## Quick start

```bash
# Node 24+
cp .env.example .env
# Pull Marketplace secrets (Neon, Resend):
#   pnpm dlx vercel env pull .env.local --yes
# Add AI_GATEWAY_API_KEY for agent chat / classification.
# Add TELEGRAM_BOT_TOKEN + TELEGRAM_BOT_USERNAME for Login Widget + bot.

pnpm install
pnpm db:migrate    # apply committed migrations to DATABASE_URL_UNPOOLED
pnpm seed          # fake Modal/Fireworks/Cursor/ElevenLabs/Decagon/Sierra dossiers
pnpm dev           # Next.js + Eve (http://localhost:3000)
pnpm dev:tui       # optional: Eve terminal UI instead
```

Open `/` → **See your first matches**. Snapshot and goals are public; “Save & enter workspace” verifies with Telegram. You can skip the web app and just message the bot.

Without `AI_GATEWAY_API_KEY` the server still boots: scoring, personalization, seed dossiers, and most smoke scripts work. Chat, classification, and discovery research that call a model return `GatewayAuthenticationError` (401).

Demo data is created only by `pnpm seed`. Production cold starts never seed and never `CREATE TABLE`. Missing Postgres fails closed.

## Project layout

```
app/                       # Next.js App Router
  page.tsx                 # public landing
  get-started/             # progressive onboarding (no login until verify)
  how-it-works/            # public nightly-workflow diagram
  app/                     # signed-in shell: Today, Opportunities, Conversation, Profile
  api/                     # onboarding, auth, conversations, opportunities, inbound, telegram
components/
  onboarding/ product/ chat/ auth/ ui/
agent/
  agent.ts                 # Sonnet-class model via AI Gateway (mockModel under eval fixture)
  instructions.md
  skills/                  # opportunity-signals, scoring, nightly-pipeline, onboarding, linkedin-personalization
  tools/                   # snake_case Eve tools
  subagents/               # job_alert_analyst, company_researcher, fit_analyst
  schedules/nightly_scout.ts   # calls runDiscovery — not free-form tool chaining
  channels/                # eve, telegram, capture-sync
  lib/                     # db, identity, career-profile, conversation, ingestion, discovery, scoring
  sandbox/workspace/memory/user-profile.md   # legacy local projection only
capture/                   # Playwright (developer Mac, not Vercel, not the member path)
evals/                     # GS-009 deterministic Eve evals
drizzle/                   # committed Postgres migrations
docs/                      # spec, architecture, ADRs, tickets, module guides
```

**Eve conventions:** authored files live under `agent/`; tool filenames are snake_case; channels are kebab-case; skills are progressive-disclosure markdown (`load_skill`).

## Auth and the `/app` workspace

Telegram Login is the primary web verification path. Completing `/get-started` and tapping the widget:

1. `POST /api/auth/telegram` verifies the widget HMAC
2. upserts the member and binds `channel_identities`
3. sets an httpOnly `gs_member_session` JWT
4. Eve accepts that JWT through `memberSessionAuth()`

`proxy.ts` keeps marketing + get-started public. `/app/*` redirects to `/get-started?verify=1` when no member session is present.

Details: [`docs/auth.md`](./docs/auth.md), ADR 0004 and ADR 0005. Deep-link tokens remain for reconnect: [`docs/telegram-link.md`](./docs/telegram-link.md).

## Inbound job alerts

Each member gets a unique `gs_…@gravy.sh` address (Resend receiving on `gravy.sh`). Forward LinkedIn / Seek / Indeed alerts there — no mailbox OAuth. Webhook: `POST /api/inbound/resend`. Duplicates collapse on canonical job URL. See [`docs/inbound-email.md`](./docs/inbound-email.md).

## Discovery and nightly pipeline

`agent/lib/discovery/run.ts` is the single orchestrator. The Eve schedule `nightly_scout` (`0 13 * * *` UTC ≈ 23:00 AEST; DST drift during AEDT) and `pnpm test:discovery` share it.

```bash
pnpm dev:no-ui
# In another terminal — fire the schedule once (port may vary):
curl -X POST http://127.0.0.1:3000/eve/v1/dev/schedules/nightly_scout
```

Runs claim idempotently, process source items, derive cited signals, refresh dossiers, score member opportunities (`scoring.ts@v1`), and send a Telegram digest only on material change (quiet hours and revoked identity stay silent). See [`docs/discovery.md`](./docs/discovery.md).

## Telegram (primary messaging + identity)

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token and username.
2. Register the Login Widget domain (required for the embedded widget; deep-link login still works without it):
   ```
   /setdomain → @YourBot → gravy.sh
   ```
   Use the hostname only — no `https://`, path, or trailing slash. Also add `https://gravy.sh` under BotFather → Login Widget → Allowed URLs if you use the newer Web Login UI.
3. Set env (local `.env` + Vercel):
   ```bash
   vercel env add TELEGRAM_BOT_TOKEN production
   vercel env add TELEGRAM_BOT_USERNAME production
   vercel env add TELEGRAM_WEBHOOK_SECRET_TOKEN production   # openssl rand -hex 32
   vercel env add TELEGRAM_LOGIN_DOMAIN production           # gravy.sh
   ```
4. Deploy, then register the webhook (Eve does **not** call `setWebhook` for you):
   ```bash
   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://YOUR_DEPLOY/eve/v1/telegram","secret_token":"YOUR_SECRET","allowed_updates":["message","callback_query"]}'
   ```
5. Message the bot (creates the member) or open the web app → onboarding → verify with Telegram (widget or **Open @your_bot** deep link) → consent to updates.
6. Inbound Telegram messages and web chat share the canonical conversation. Nightly digests send on Telegram when the member is linked and consented, and are recorded on that conversation.

If the widget renders **Bot domain invalid**, the deep-link button still signs members in. Fix the widget by re-running `/setdomain` for `gravy.sh`.

## Developer capture (not the member path)

Local Playwright can scrape a logged-in LinkedIn/X feed or own profile. This is **not** a production member journey (`pnpm seed` and `/get-started` substitute). Hard guardrails: read-only, 2–6s delays, ≤150 items/source, abort on login wall/captcha. See [`capture/README.md`](./capture/README.md).

```bash
pnpm capture:profile -- --headed   # optional: own LinkedIn → Career Identity
pnpm exec tsx capture/run-capture.ts --headed --dry-run --source=linkedin

# After deploy, sync captured items to the hosted agent:
CAPTURE_SYNC_URL=https://<deploy>/eve/v1/capture-sync/items \
CAPTURE_SYNC_TOKEN=... \
pnpm capture
```

Example launchd plist: `scripts/com.gravyscout.capture.plist.example`. Capture-sync fails closed (503) when its token is unset.

## Deploy

```bash
pnpm build          # Next.js (webpack; required for Eve *.js → .ts alias)
vercel deploy       # Neon injects DATABASE_URL
```

Apply migrations against `DATABASE_URL_UNPOOLED` before serving member traffic. `pnpm build:eve` is the Eve Build Output command (`next.config.ts` → `eveBuildCommand`).

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Next.js chat UI + Eve agent (HMR) |
| `pnpm dev:tui` | Eve HMR + terminal UI |
| `pnpm dev:no-ui` | Headless Eve HTTP (schedules, capture-sync) |
| `pnpm db:generate` | Generate a migration after editing the Drizzle schema |
| `pnpm db:migrate` | Apply committed migrations using the direct Neon URL |
| `pnpm test:database` | Two-member Postgres isolation |
| `pnpm test:auth` | Member-session / Eve auth wiring + identity upserts |
| `pnpm test:telegram-login` | Telegram Login Widget HMAC + session mint |
| `pnpm test:career-profile` | Structured profile precedence + résumé ingest |
| `pnpm test:conversation` | Canonical conversation bridge + idempotency |
| `pnpm test:telegram-link` | Link tokens, revocation, quiet hours |
| `pnpm test:inbound` | Job-alert parse, webhook verify, ingest dedupe |
| `pnpm test:discovery` | Discovery claim/retry, evidence, constraints, noop digests |
| `pnpm test:scoring` | Deterministic scoring + role personalization |
| `pnpm test:evals` | Eve deterministic eval suite (GS-009 fixture agent) |
| `pnpm test:evals:list` | List discovered Eve eval ids |
| `pnpm seed` | Seed fake dossiers + source items |
| `pnpm capture` / `capture:dry` | Playwright feed capture (dev only) |
| `pnpm capture:profile` | Playwright LinkedIn own-profile → Career Identity (dev only) |
| `pnpm typecheck` | `tsc --noEmit` (web + agent) |
| `pnpm exec tsx scripts/verify-dossier.ts` | Confirm seed dossiers |

Quality gates: `pnpm typecheck`, the `tsx` smoke scripts under `scripts/`, and `pnpm test:evals`. There is no separate linter or test runner.

Evals set `GRAVY_SCOUT_EVAL_FIXTURE=1` and use `mockModel` plus in-memory tool handlers so hard gates pass without AI Gateway or Neon. Do not set that env outside eval runs. See [`evals/README.md`](./evals/README.md).

## Persistence

| Concern | Source of truth |
| --- | --- |
| Members, career profile, preferences, feedback | Neon (`agent/lib/career-profile.ts`) |
| Conversation + messages | Neon (`agent/lib/conversation.ts`) |
| Source items, signals, dossiers, opportunities, discovery runs | Neon |
| Telegram channel identity + link tokens | Neon (`agent/lib/identity.ts`) |
| Eve session cursors | Per-surface rows on the conversation; not the product timeline |
| `user-profile.md` | Legacy / local-only projection — do not extend |

Module guides: [`docs/database.md`](./docs/database.md), [`docs/career-profile.md`](./docs/career-profile.md), [`docs/conversation.md`](./docs/conversation.md).
