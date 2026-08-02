# Gravy Scout

Personalized opportunity-intelligence agent built on [Eve](https://eve.dev), Vercel's filesystem-first agent framework.

The repository currently contains a single-user prototype for APAC tech-sales discovery. It demonstrates deterministic company scoring, role personalization, dossiers, web chat, Telegram delivery, and local LinkedIn/X capture. It does **not** yet provide multi-user persistence or genuinely synchronized web/Telegram conversations.

The target product learns a member's background and goals, ingests job-board alerts through email, researches public expansion and hiring evidence, and surfaces advertised, likely, and non-obvious opportunities with citations. Start with:

1. [`CONTEXT.md`](./CONTEXT.md) — canonical domain language
2. [`docs/specs/gravy-scout-v1.md`](./docs/specs/gravy-scout-v1.md) — product specification
3. [`docs/architecture/target-architecture.md`](./docs/architecture/target-architecture.md) — selected architecture and migration rationale
4. [`docs/tickets/README.md`](./docs/tickets/README.md) — dependency-ordered agent work

The remaining sections document how to run and inspect the current prototype while it is migrated.

## Stack

| Layer | Choice |
| --- | --- |
| Agent | Eve (`agent/` filesystem layout) |
| Web UI | Next.js + `useEveAgent` (same-origin `/eve/v1/*` via `withEve`) |
| Models | AI Gateway — Sonnet for chat/synthesis, Haiku for batch classify |
| DB | Neon Postgres + Drizzle migrations |
| Capture | Playwright, your logged-in browser profile (read-only) |
| Messaging | **Telegram** (primary) · Twilio WhatsApp optional fallback |

## Quick start (Phase 1)

```bash
# Node 24+
cp .env.example .env
# Add AI_GATEWAY_API_KEY (or `vercel link` + OIDC)

pnpm install
pnpm db:migrate    # apply committed migrations to DATABASE_URL_UNPOOLED
pnpm seed          # fake Modal/Fireworks/Cursor/ElevenLabs dossiers
pnpm dev           # Next.js chat UI + Eve agent (http://localhost:3000)
pnpm dev:tui       # optional: Eve terminal UI instead
```

Provision Neon through the Vercel Marketplace and pull `.env.local` before migrating. Demo data is created only by the explicit `pnpm seed` command; production cold starts never seed automatically. Open the web app — first visit runs the prototype setup (role → optional Telegram details → matches), then auto-starts the career-advisor chat. Without `AI_GATEWAY_API_KEY`, seeded matches still work; agent chat needs the key. Telegram and web currently use separate Eve sessions, and the web thread list is browser-local.

To refresh Career Identity from a logged-in browser profile:

```bash
pnpm capture:profile -- --headed   # first run: log in once
pnpm capture:profile               # thereafter
```

Or tell the agent your title/company/location in chat — it calls `ingest_linkedin_profile`.

Browse `/how-it-works` for the nightly workflow diagram (public). Chat, onboarding, and Eve HTTP require Clerk sign-in. See `docs/auth.md`.

## Project layout (Eve conventions)

```
app/                       # Next.js App Router chat UI
components/chat/           # sidebar, empty state, composer, message parts
next.config.ts             # withEve() mounts agent routes same-origin
agent/
  agent.ts                 # Sonnet-class model via AI Gateway
  instructions.md          # persona + ping rules
  skills/                  # opportunity-signals, scoring, nightly-pipeline
  tools/                   # snake_case Eve tools
  schedules/nightly_scout.ts
  channels/                # eve, telegram, twilio, capture-sync
  lib/                     # db, classify, scoring, profile, messaging
  sandbox/workspace/memory/user-profile.md
capture/                   # Playwright (runs on your Mac, not on Vercel)
scripts/seed.ts
```

**Eve diffs vs the original build prompt (intentional):**

- Authored files live under `agent/`, not repo root.
- Tool filenames are snake_case (`get_new_feed_items.ts`); channels are kebab-case.
- Skills are progressive-disclosure markdown (model calls `load_skill`).
- Telegram is the primary push channel; WhatsApp remains an optional Twilio fallback.
- Classification uses a **cheap model inside** `classify_feed_items`; the schedule still prompts the agent free-form.
- Nightly cron is `0 13 * * *` UTC ≈ 23:00 AEST (DST drift during AEDT).

## Capture (Phase 2)

```bash
# First run — headed, log in once, profile persists at ./.browser-profile
pnpm exec tsx capture/run-capture.ts --headed --dry-run --source=x
pnpm exec tsx capture/run-capture.ts --headed --dry-run --source=linkedin

# Thereafter
pnpm capture:dry -- --source=x
pnpm capture
```

Hard guardrails: read-only, 2–6s delays, ≤150 items/source, abort on login wall/captcha. See `capture/README.md`.

## Nightly pipeline (Phase 3)

```bash
pnpm dev:no-ui
# In another terminal — fire the schedule once:
curl -X POST http://127.0.0.1:3000/eve/v1/dev/schedules/nightly_scout
```

Port may vary — check the Eve dev server URL. Inspect the session stream for the digest.

## Telegram (primary messaging)

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token and username.
2. Set env (local `.env` + Vercel):
   ```bash
   vercel env add TELEGRAM_BOT_TOKEN production
   vercel env add TELEGRAM_BOT_USERNAME production
   vercel env add TELEGRAM_WEBHOOK_SECRET_TOKEN production   # openssl rand -hex 32
   ```
3. Deploy, then register the webhook (eve does **not** call `setWebhook` for you):
   ```bash
   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://YOUR_DEPLOY/eve/v1/telegram","secret_token":"YOUR_SECRET","allowed_updates":["message","callback_query"]}'
   ```
4. Open the web app → onboarding → **Open @your_bot and tap Start** → consent to updates.
5. Chat inbound on Telegram; nightly digests via `send_telegram_message` when linked + consented.

## WhatsApp (optional fallback)

1. Twilio sandbox → set `TWILIO_*`, `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`, `WHATSAPP_TO=whatsapp:+61…`
2. Point Messaging webhook at `https://<deploy>/eve/v1/twilio/messages`
3. Used only if Telegram is not linked and Twilio is configured.

## Deploy + local capture sync (Phase 5)

```bash
# Hosted agent (Vercel) — Neon injects DATABASE_URL
pnpm build
vercel deploy

# On your Mac — launchd/cron runs capture, then syncs:
CAPTURE_SYNC_URL=https://<deploy>/eve/v1/capture-sync/items \
CAPTURE_SYNC_TOKEN=... \
pnpm capture
```

Example launchd plist: `scripts/com.gravyscout.capture.plist.example`.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Next.js chat UI + Eve agent (HMR) |
| `pnpm dev:tui` | Eve HMR + terminal UI |
| `pnpm db:generate` | Generate a migration after editing the Drizzle schema |
| `pnpm db:migrate` | Apply committed migrations using the direct Neon URL |
| `pnpm test:database` | Verify two-member Postgres data isolation |
| `pnpm test:auth` | Verify Clerk/Eve auth wiring and identity upserts |
| `pnpm test:career-profile` | Verify structured profile precedence + résumé ingest |
| `pnpm test:conversation` | Verify canonical conversation bridge + idempotency |
| `pnpm seed` | Seed fake dossiers + raw items |
| `pnpm capture` / `capture:dry` | Playwright feed capture |
| `pnpm capture:profile` | Playwright LinkedIn *own profile* → Career Identity |
| `pnpm typecheck` | `tsc --noEmit` (web + agent) |
| `pnpm test:scoring` | Smoke test scoring + role personalization |
| `pnpm exec tsx scripts/verify-dossier.ts` | Confirm seed dossiers |

## Prototype persistence warning

Web and Eve browser access require Clerk. Career profile/preferences/messaging are Postgres-backed (GS-003), and conversations/messages are server-backed (GS-004). Telegram linking/sync remains GS-005.
