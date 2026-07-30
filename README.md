# Gravy Scout

Personal GTM opportunity agent for APAC tech sales. Built on [Eve](https://eve.dev) (Vercel's filesystem-first agent framework).

Every night it classifies what you missed on LinkedIn/X, maintains company dossiers, and pings WhatsApp when a real opportunity appears. You chat back to correct preferences — those updates persist.

## Stack

| Layer | Choice |
| --- | --- |
| Agent | Eve (`agent/` filesystem layout) |
| Web UI | Next.js + `useEveAgent` (same-origin `/eve/v1/*` via `withEve`) |
| Models | AI Gateway — Sonnet for chat/synthesis, Haiku for batch classify |
| DB | SQLite via Drizzle + libSQL (Turso-ready `DATABASE_URL`) |
| Capture | Playwright, your logged-in browser profile (read-only) |
| Messaging | Twilio WhatsApp (+ Eve HTTP/TUI for local) |

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

Open the web app and ask things like "why is Fireworks interesting?" or "score Modal". Without `AI_GATEWAY_API_KEY`, chat still works against seed dossiers; classification batches no-op until the key is set.

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
  channels/                # eve, twilio, capture_sync
  lib/                     # db, classify, scoring, profile
  sandbox/workspace/memory/user-profile.md
capture/                   # Playwright (runs on your Mac, not on Vercel)
scripts/seed.ts
```

**Eve diffs vs the original build prompt (intentional):**

- Authored files live under `agent/`, not repo root.
- Tool filenames are snake_case (`get_new_feed_items.ts`).
- Skills are progressive-disclosure markdown (model calls `load_skill`).
- Twilio channel is first-class; WhatsApp uses `whatsapp:+…` addresses on the same Messages API.
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

## WhatsApp (Phase 4)

1. Twilio sandbox → set `TWILIO_*`, `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`, `WHATSAPP_TO=whatsapp:+61…`
2. Point Messaging webhook at `https://<deploy>/eve/v1/twilio/messages`
3. Chat inbound via Twilio channel; nightly digest via `send_whatsapp_message` tool

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
| `pnpm typecheck` | `tsc --noEmit` (web + agent) |
| `pnpm test:scoring` | Smoke test scoring math |
| `pnpm exec tsx scripts/verify-dossier.ts` | Confirm seed dossiers |

## Single-user note

Optimized for one user and near-zero cost. DB sits behind `agent/lib/db/repo.ts` so Postgres/Turso can replace the file later without rewriting tools.
