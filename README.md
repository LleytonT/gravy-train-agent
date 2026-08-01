# Gravy Scout

Personal GTM opportunity agent for APAC tech sales. Built on [Eve](https://eve.dev) (Vercel's filesystem-first agent framework).

Connect your LinkedIn profile → Gravy Scout maps your role onto gravy-train companies (e.g. Sales Engineer at Vercel AU → Field / Deployment / Sales Engineer seats at Decagon, Sierra, Cursor, Fireworks) and names who to reach out to (hiring manager, peer in seat, adjacent).

Every night it classifies what you missed on LinkedIn/X, maintains company dossiers, and pings **Telegram** when a real opportunity appears. You chat back (web or Telegram) to correct preferences — those updates persist.

## Stack

| Layer | Choice |
| --- | --- |
| Agent | Eve (`agent/` filesystem layout) |
| Web UI | Next.js + `useEveAgent` (same-origin `/eve/v1/*` via `withEve`) |
| Models | AI Gateway — Sonnet for chat/synthesis, Haiku for batch classify |
| DB | SQLite via Drizzle + libSQL (Turso-ready `DATABASE_URL`) |
| Capture | Playwright, your logged-in browser profile (read-only) |
| Messaging | **Telegram** (primary) · Twilio WhatsApp optional fallback |

## Quick start (Phase 1)

```bash
# Node 24+
cp .env.example .env
# Add AI_GATEWAY_API_KEY (or `vercel link` + OIDC)

pnpm install
pnpm seed          # fake Modal/Fireworks/Cursor/ElevenLabs dossiers
pnpm dev           # Next.js chat UI + Eve agent (http://localhost:3000)
pnpm dev:tui       # optional: Eve terminal UI instead
```

Open the web app — first visit runs a short setup (role → **link Telegram** with consent → matches), then auto-starts the career-advisor chat. Without `AI_GATEWAY_API_KEY`, matches still work from seed data; agent chat needs the key.

To refresh Career Identity from a logged-in browser profile:

```bash
pnpm capture:profile -- --headed   # first run: log in once
pnpm capture:profile               # thereafter
```

Or tell the agent your title/company/location in chat — it calls `ingest_linkedin_profile`.

Browse `/how-it-works` for the nightly workflow diagram. Browser chat is open via `none()` in `agent/channels/eve.ts`. Swap that for real auth before sharing sensitive data.

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
# Hosted agent (Vercel) — use Turso/libSQL for DATABASE_URL
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
| `pnpm seed` | Seed fake dossiers + raw items |
| `pnpm capture` / `capture:dry` | Playwright feed capture |
| `pnpm capture:profile` | Playwright LinkedIn *own profile* → Career Identity |
| `pnpm typecheck` | `tsc --noEmit` (web + agent) |
| `pnpm test:scoring` | Smoke test scoring + role personalization |
| `pnpm exec tsx scripts/verify-dossier.ts` | Confirm seed dossiers |

## Single-user note

Optimized for one user and near-zero cost. DB sits behind `agent/lib/db/repo.ts` so Postgres/Turso can replace the file later without rewriting tools.
