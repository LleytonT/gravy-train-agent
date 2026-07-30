# AGENTS.md

## Cursor Cloud specific instructions

Gravy Scout is a single TypeScript product built on **Eve** (Vercel's agent framework). It has two runtime units:
- **Eve agent** (`agent/`) — the core server: chat sessions, tools, the nightly scoring/dossier pipeline, and channels (Twilio WhatsApp, capture-sync). Run it with `pnpm dev` (interactive TUI) or `pnpm dev:no-ui` (headless HTTP).
- **Capture worker** (`capture/`) — local Playwright scripts that scrape a logged-in LinkedIn/X browser profile. Only needed to ingest *real* feed data; `pnpm seed` substitutes fake dossiers for local testing.

Standard commands live in `README.md` and `package.json` (`dev`, `dev:no-ui`, `build`, `seed`, `db:ensure`, `typecheck`, `test:scoring`, `capture*`). There is **no linter** and **no test runner** — the quality gates are `pnpm typecheck` (`tsc --noEmit`) and the `tsx` smoke scripts under `scripts/`.

Non-obvious caveats:
- **Node 24 is required** (`engines.node: 24.x`; `eve` hard-fails on older Node). The VM's default `/exec-daemon/node` is Node 22 and sits early on `PATH`. The environment snapshot installs Node 24 via `nvm` and symlinks `node`/`npm`/`npx`/`corepack` into `/usr/local/cargo/bin` (the one `PATH` dir ahead of `/exec-daemon`) so Node 24 wins in every shell. If you ever see "eve requires Node.js >=24", run `node --version`; if it reports v22, re-create those symlinks from `$(ls -d ~/.nvm/versions/node/v24*/bin | tail -1)`.
- `pnpm` is installed globally for Node 24 (it lives in the nvm bin dir). `pnpm info` hits the npm registry (built-in pnpm command); use `pnpm run info` to run the Eve `info` script.
- The SQLite DB (`./data/gravy-scout.db`) and its schema are **auto-created on first use** — no migration step. `pnpm seed` populates fake Modal/Fireworks/Cursor/ElevenLabs dossiers.
- **`AI_GATEWAY_API_KEY` is required for any LLM work** (chat sessions, nightly classification, dossier synthesis, ping drafting). Without it the agent server still boots and processes requests, but model calls return `GatewayAuthenticationError` (401). The deterministic core — opportunity **scoring** (`agent/lib/scoring.ts`) and the DB/dossier layer — works fully without a key (`pnpm test:scoring`, `pnpm seed`, `tsx scripts/verify-dossier.ts`).
- **No `.env` file is required.** The agent reads `AI_GATEWAY_API_KEY` straight from `process.env` (an injected Cloud Agent secret is enough), and `DATABASE_URL` defaults to `file:./data/gravy-scout.db` in code (`agent/lib/db/client.ts`). Creating `.env` from `.env.example` is only for setting non-secret overrides locally; if you do, note `dotenv` loads it with `override: true`, so a `.env` value wins over an injected secret of the same name.
- **Env-var / stale-process gotcha:** a running server only sees env vars that existed when its process started. If you start `pnpm dev`/`dev:no-ui` inside a long-lived tmux/shell session that predates a newly-added secret, model calls will 401 even though the secret is set — the session holds a stale env. Start the server from a fresh shell (or `tmux new-session -e AI_GATEWAY_API_KEY=...`) so it inherits the current environment.
- The dev server picks its own port and prints it (e.g. `http://127.0.0.1:2000/`); it is **not** always 3000. Session API: `POST /eve/v1/session` (body `{"message":"..."}`), stream via `GET /eve/v1/session/:sessionId/stream`.
- Twilio WhatsApp and the capture-sync endpoint fail closed / return 503 when their env vars are unset — expected in local dev.
