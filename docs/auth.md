# Authentication and member context

Gravy Scout verifies members primarily through **Telegram Login**. Clerk remains an optional secondary web path. The identity module maps verified principals to stable internal `memberId` values.

## Why not Clerk-first?

Clerk is useful managed email auth, but Gravy Scout's product surface already depends on a verified Telegram user ID for digests and conversation sync. Asking for Clerk before the member is ready to use the product created friction without adding product value. Telegram Login proves the same identity the bot channel needs.

## Public vs secure

| Surface | Auth |
| --- | --- |
| `/`, `/how-it-works`, `/get-started` | Public |
| `/api/onboarding/preview` | Public (no persistence) |
| `/api/auth/*` | Public entry points |
| `/app/*` workspace | Member session (Telegram) or Clerk |
| Conversation / opportunity / profile APIs | `requireAuthenticatedMember()` |

## Telegram Login flow

1. Member completes career snapshot on `/get-started` and previews matches without signing in.
2. At “Save & enter workspace”, they verify with Telegram.
3. `POST /api/auth/telegram` verifies the widget HMAC over **all** received fields (including `allows_write_to_pm` when write access was requested), upserts the member via `upsertMemberFromTelegramLogin`, binds `channel_identities`, and sets an httpOnly `gs_member_session` JWT.
4. **Fallback when the widget shows “Bot domain invalid”:** `POST /api/auth/telegram/challenge` mints a pending member + one-time `t.me` deep link. After the member taps Start, the Telegram webhook consumes the token and the browser polls until it can mint the same session cookie.
5. Eve accepts that JWT through `memberSessionAuth()`.

Configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`. Set `TELEGRAM_LOGIN_DOMAIN=gravy.sh` (or `NEXT_PUBLIC_APP_URL=https://gravy.sh`) and register that hostname with BotFather (`/setdomain`, hostname only — no `https://`). Optionally set `MEMBER_SESSION_SECRET` (defaults to a SHA-256 of the bot token).

## Optional Clerk

If Clerk keys are present:

- Email sign-in remains available as a secondary control on `/get-started`.
- `clerkMemberAuth()` still works for Eve.
- `/api/auth/token` can bridge a Clerk principal into a member-session JWT.

Local Eve TUI / loopback still uses `localDevMemberAuth()` → `external_auth_id = local-dev`.

## Request flow

1. `proxy.ts` keeps marketing + get-started public. `/app` redirects to `/get-started?verify=1` when neither a member session nor Clerk session is present. Other protected APIs fall through to Clerk `auth.protect()` only when no member session cookie exists.
2. Handlers call `requireAuthenticatedMember()` (`lib/auth/member.ts`), which prefers the member-session cookie, then Clerk.
3. Telegram deep-link minting (`POST /api/telegram/link`) remains for reconnect; Login Widget already binds identity on first verify.
4. Chat sends the member-session JWT as `Authorization: Bearer …` via `/api/auth/token`.
5. Eve auth walk: `[memberSessionAuth(), clerkMemberAuth(), vercelOidc(), localDevMemberAuth()]` — anonymous `none()` stays removed.
6. Tools read `attributes.memberId` through `requireMemberCaller()`.

## Verification

```bash
pnpm test:auth
pnpm test:telegram-login
pnpm test:telegram-bot-token
pnpm check:telegram   # live; needs TELEGRAM_BOT_TOKEN in .env
pnpm typecheck
```
