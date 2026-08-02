# AGENTS.md

## Cursor Cloud specific instructions

Gravy Scout is a single TypeScript product built on **Eve** (Vercel's agent framework). It has two runtime units:
- **Eve agent** (`agent/`) — the core server: chat sessions, tools, the nightly scoring/dossier pipeline, and channels (Twilio WhatsApp, capture-sync). Run it with `pnpm dev` (interactive TUI) or `pnpm dev:no-ui` (headless HTTP).
- **Capture worker** (`capture/`) — local Playwright scripts that scrape a logged-in LinkedIn/X browser profile. Only needed to ingest *real* feed data; `pnpm seed` substitutes fake dossiers for local testing.

Standard commands live in `README.md` and `package.json` (`dev`, `dev:no-ui`, `build`, `db:generate`, `db:migrate`, `test:database`, `seed`, `typecheck`, `test:scoring`, `capture*`). There is **no linter** and **no test runner** — the quality gates are `pnpm typecheck` (`tsc --noEmit`) and the `tsx` smoke scripts under `scripts/`.

Non-obvious caveats:
- **Node 24 is required** (`engines.node: 24.x`; `eve` hard-fails on older Node). The VM's default `/exec-daemon/node` is Node 22 and sits early on `PATH`. The environment snapshot installs Node 24 via `nvm` and symlinks `node`/`npm`/`npx`/`corepack` into `/usr/local/cargo/bin` (the one `PATH` dir ahead of `/exec-daemon`) so Node 24 wins in every shell. If you ever see "eve requires Node.js >=24", run `node --version`; if it reports v22, re-create those symlinks from `$(ls -d ~/.nvm/versions/node/v24*/bin | tail -1)`.
- `pnpm` is installed globally for Node 24 (it lives in the nvm bin dir). `pnpm info` hits the npm registry (built-in pnpm command); use `pnpm run info` to run the Eve `info` script.
- Neon Postgres is required. Runtime uses the pooled `DATABASE_URL`; Drizzle migrations use `DATABASE_URL_UNPOOLED`. Apply committed migrations with `pnpm db:migrate`. Schema creation and demo seeding never run on a production cold start. `pnpm seed` explicitly populates fake Modal/Fireworks/Cursor/ElevenLabs/Decagon/Sierra dossiers for local development.
- **LinkedIn personalization**: First-run web onboarding (`/` → welcome + title/company/location/interests → `POST /api/onboarding`) writes Career Identity and returns matches; the chat UI shows a matches card and auto-kicks the career-advisor turn. Alternatives: chat `ingest_linkedin_profile` or optional `pnpm capture:profile`. `recommend_roles` maps e.g. Sales Engineer @ Vercel AU → Field/Deployment/SE seats at Decagon/Sierra/Cursor/Fireworks; `find_outreach_targets` returns hiring manager / peer-in-seat / adjacent.
- **`AI_GATEWAY_API_KEY` is required for any LLM work** (chat sessions, nightly classification, dossier synthesis, ping drafting). Without it the agent server still boots and processes requests, but model calls return `GatewayAuthenticationError` (401). The deterministic core — opportunity **scoring** (`agent/lib/scoring.ts`), **role personalization** (`agent/lib/personalize.ts`), and the DB/dossier layer — works fully without a key (`pnpm test:scoring`, `pnpm seed`, `tsx scripts/verify-dossier.ts`). Add the key to `.env` (copy from `.env.example`) to exercise the full pipeline.
- The dev server picks its own port and prints it (e.g. `http://127.0.0.1:2000/`); it is **not** always 3000. Session API: `POST /eve/v1/session` (body `{"message":"..."}`), stream via `GET /eve/v1/session/:sessionId/stream`.
- Twilio WhatsApp and the capture-sync endpoint fail closed / return 503 when their env vars are unset — expected in local dev.

## Architecture reset

The code above describes the current single-user prototype, not the target product. Before changing product architecture, read:

1. `CONTEXT.md`
2. `docs/specs/gravy-scout-v1.md`
3. `docs/architecture/target-architecture.md`
4. relevant decisions under `docs/adr/`
5. the selected ticket under `docs/tickets/`

Do not extend the shared Markdown profile, browser-local chat history, anonymous production auth, production `/tmp` persistence, or member-facing LinkedIn/X Playwright capture. Those are migration sources, not target seams.

## Agent skills

### Issue tracker

Agent-ready work is tracked as local Markdown under `docs/tickets/` until the owner chooses to publish it to GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository. Use `CONTEXT.md` for domain language and `docs/adr/` for durable architectural decisions. See `docs/agents/domain.md`.

### Installed skills

Project-local Matt Pocock engineering skills are under `.agents/skills/`. Selection guidance and additional discovered skills are recorded in `docs/agents/skills.md`.
