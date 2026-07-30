# Gravy Scout — Feed Capture

Read-only Playwright scripts that gently scroll LinkedIn and X home feeds and store **derived metadata only** (author, headline, excerpt ≤200 chars, URL, timestamp).

## Guardrails

- **Read-only**: never post, like, comment, follow, connect, or DM.
- **Gentle**: one scroll session per run, 2–6s randomized delays, max ~150 items per source.
- **Fail safe**: abort immediately on login wall or captcha — no aggressive retries.

## LinkedIn profile (personalization)

Capture your **own** LinkedIn profile into `user-profile.md` Career Identity (title, company, location, role family):

```bash
pnpm capture:profile -- --headed   # first run / login
pnpm capture:profile               # thereafter
pnpm capture:profile:dry           # print JSON only
```

Same guardrails: read-only, abort on login wall/captcha. Or describe your role in chat — the agent calls `ingest_linkedin_profile`.

## First-time login (required)

Sessions are stored in a persistent Chromium profile so you only log in once.

1. Run in **headed** mode so you can sign in manually:

   ```bash
   npx tsx capture/run-capture.ts --headed --dry-run --source=linkedin
   npx tsx capture/run-capture.ts --headed --dry-run --source=x
   ```

2. Complete login in the browser window. If a captcha appears, solve it manually once.

3. Confirm capture works (items printed with `--dry-run`), then run headless:

   ```bash
   npx tsx capture/run-capture.ts --source=all
   ```

### Profile location

Default: `./.browser-profile` at the repo root.

Override with:

```bash
export CAPTURE_PROFILE_DIR=/path/to/your/profile
```

## CLI

```bash
tsx capture/run-capture.ts [--dry-run] [--source=x|linkedin|all] [--headed]
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Print captured items; do not write to DB |
| `--source=` | `linkedin`, `x`, or `all` (default: `all` — LinkedIn first, then X) |
| `--headed` | Show browser UI (use for login) |

## Environment

Create `.env` at the repo root (loaded automatically):

```env
# Optional: local SQLite/Turso DB via agent repo
DATABASE_URL=file:./data/gravy-scout.db

# Optional: remote sync after local write
CAPTURE_SYNC_URL=https://your-app.example/api/capture/sync
CAPTURE_SYNC_TOKEN=your-secret-token

# When set, skip local DB and only POST to sync URL
SYNC_ONLY=1
```

## Exit codes

- `0` — capture completed without login/captcha abort
- `1` — login wall or captcha aborted one or more sources, or fatal error

## Data stored per item

```ts
{
  source: 'linkedin' | 'x',
  author: string,
  authorHeadline?: string | null,
  excerpt: string,      // max 200 chars
  url: string,
  postedAt?: string | null,
}
```

No full post HTML, images, or engagement actions are captured.
