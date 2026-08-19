# Progress log

## Known issues

**GS-015 /start diagnosis (2026-08-19):** Production silence is **cause 1 (webhook rejected before the handler)** compounded by **cause 3 (bare `/start` is linking-only)**. `getWebhookInfo` for @GravyScoutBot shows URL `https://gravy.sh/eve/v1/telegram`, `pending_update_count: 4`, and `last_error_message: Wrong response from the webhook: 401 Unauthorized`. The URL is not empty or stale — Telegram reaches the deploy — but `proxy.ts` Clerk `auth.protect()` does not treat `/eve/v1/telegram` as public, so the secret-token POST never enters Eve. Independently, `agent/channels/telegram.ts` intercepts every `/start`: with no payload (or the legacy `link` payload) it `replyAndDrop`s “open the one-time link from the web” and never upserts a member or starts intake. Unknown chat ids are already a handled state (not an exception). Fix: allow Eve channel webhooks through the proxy (they verify their own secrets), then add Telegram-first command routing so bare `/start` always creates or resumes a member and replies.

---

## Session log

### 2026-08-19 — GS-015 Telegram-first /start + command surface

- Diagnosed silent `/start`: production webhook URL is live but Telegram reports **401 Unauthorized** because Clerk `auth.protect()` in `proxy.ts` did not allow `/eve/v1/telegram`. Independently, GS-005 treated bare `/start` as “open the web link” and never created a member.
- Allowed Eve Telegram/Twilio/capture-sync webhooks through `proxy.ts` (they verify their own secrets).
- Added `agent/lib/telegram-bot.ts` + `telegram-intake.ts` (DB-backed intake on the career profile) with explicit command routing: `/start`, `/profile`, `/preferences`, `/opportunities`, `/upload`, `/pause`, `/resume`, `/help`.
- Bare `/start` upserts member + channel identity, never stays silent; `/start <token>` keeps GS-005 linking then welcome-back.
- Digest cards: Interested / Dismiss / Tell me more callbacks (`gs:` prefix).
- Demoted web: `/app` Telegram banner; get-started success CTA is Open Telegram (no `/app` redirect).
- Smoke: `pnpm test:telegram-bot`. Quality gates: typecheck, telegram-link, conversation, auth, evals.
