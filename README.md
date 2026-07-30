# Gravy Scout

Personal GTM opportunity agent for APAC tech sales. Built on [Eve](https://eve.dev) (Vercel's filesystem-first agent framework).

Every night it classifies what you missed on LinkedIn/X, maintains company dossiers, and pings WhatsApp when a real opportunity appears. You chat back to correct preferences — those updates persist.

## Stack

| Layer | Choice |
| --- | --- |
| Agent | Eve (`agent/` filesystem layout) |
| Web UI | Next.js + `useEveAgent` (same-origin `/eve/v1/*` via `withEve`) |
| Models | AI Gateway — `AGENT_MODEL` (chat/synthesis) + `CLASSIFY_MODEL` (batch classify); swap or fine-tune via env |
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

Open the web app and ask things like “why is Fireworks interesting?” or “score Modal”. Without `AI_GATEWAY_API_KEY`, chat still works against seed dossiers; classification batches no-op until the key is set.

The chat UI follows common Mobbin patterns from Claude / ChatGPT / Perplexity: session sidebar, branded empty state with starter prompts, sticky composer, streaming status, and inline tool-activity disclosure.

Browser chat is currently open (`none()` in `agent/channels/eve.ts`) so anyone with the URL can talk to the agent. Replace that with Clerk / Auth.js / a custom `AuthFn` before sharing sensitive data.

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
  lib/                     # db, classify, scoring, profile, models
  sandbox/workspace/memory/user-profile.md
capture/                   # Playwright (runs on your Mac, not on Vercel)
evals/                     # scoring / classify / digest / chat harness
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

## Evals, multi-LLM choice, fine-tunes

There is no Jest/Vitest — evals are `tsx` scripts under `evals/`.

| Command | Purpose |
| --- | --- |
| `pnpm eval` | Offline suites (scoring + digest + chat fixtures) |
| `pnpm eval:scoring` / `pnpm test:scoring` | Gravy Train Index + preference parsing |
| `pnpm eval:classify` | Gold-label classify accuracy (`AI_GATEWAY_API_KEY`) |
| `pnpm eval:compare` | Sweep `CLASSIFY_MODELS` for model pick / fine-tune check |
| `pnpm eval:export` | Write classify fine-tune JSONL to `data/evals/` |
| `pnpm eval:digest` / `pnpm eval:chat` | Digest rubric / tool-use scenarios |

**What you need to choose an LLM or ship a fine-tune:** a labeled classify gold set (`evals/fixtures/classify-gold.json`), deterministic scoring regressions, digest + chat rubrics, env-overridable `AGENT_MODEL` / `CLASSIFY_MODEL`, and a compare matrix. Keep scoring in code; fine-tune classification (optionally digest tone later). Full checklist: [`evals/README.md`](evals/README.md).

```bash
pnpm eval                                 # no API key
CLASSIFY_MODEL=openai/gpt-5-mini pnpm eval:classify
CLASSIFY_MODELS=anthropic/claude-haiku-4.5,openai/gpt-5-mini pnpm eval:compare
pnpm eval:export                          # then train externally → set CLASSIFY_MODEL
```

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Next.js chat UI + Eve agent (HMR) |
| `pnpm dev:tui` | Eve HMR + terminal UI |
| `pnpm seed` | Seed fake dossiers + raw items |
| `pnpm capture` / `capture:dry` | Playwright feed capture |
| `pnpm typecheck` | `tsc --noEmit` (web + agent) |
| `pnpm eval` / `eval:*` | Agent eval harness (see above) |
| `pnpm test:scoring` | Alias for `eval:scoring` |
| `pnpm exec tsx scripts/verify-dossier.ts` | Confirm seed dossiers |

## Single-user note

Optimized for one user and near-zero cost. DB sits behind `agent/lib/db/repo.ts` so Postgres/Turso can replace the file later without rewriting tools.
