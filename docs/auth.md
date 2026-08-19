# Authentication and member context

Gravy Scout verifies members through **Telegram**. There is no email/password provider. The identity module maps a verified Telegram user ID to a stable internal `memberId`.

## Why Telegram?

The product is a texting-first agent. Digests, chat, and conversation sync already need a verified Telegram user ID. A separate web auth provider duplicated identity and added Marketplace/SDK weight without a product surface.

## Public vs secure

| Surface | Auth |
| --- | --- |
| `/`, `/how-it-works`, `/get-started` | Public |
| `/api/onboarding/preview` | Public (no persistence) |
| `/api/auth/*` | Public entry points |
| Telegram private chat | Verified Telegram user ID (auto-provisions the member) |
| `/app/*` workspace | Member session JWT minted after Telegram Login or deep-link challenge |
| Conversation / opportunity / profile APIs | `requireAuthenticatedMember()` |

## Telegram as membership

1. **Text the bot.** A private-chat webhook with a verified Telegram user ID creates or resolves the member (`upsertMemberFromTelegramLogin`) and binds `channel_identities`. Username is display metadata only.
2. **Web workspace.** Member completes career snapshot on `/get-started`, then verifies with the Telegram Login Widget. `POST /api/auth/telegram` verifies the widget HMAC, upserts the same Telegram member, and sets an httpOnly `gs_member_session` JWT.
3. **Fallback when the widget shows “Bot domain invalid”:** `POST /api/auth/telegram/challenge` mints a pending member + one-time `t.me` deep link. After the member taps Start, the webhook consumes the token and the browser polls until it can mint the same session cookie.
4. Eve HTTP accepts that JWT through `memberSessionAuth()`.

Configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`. Set `TELEGRAM_LOGIN_DOMAIN=gravy.sh` (or `NEXT_PUBLIC_APP_URL=https://gravy.sh`) and register that hostname with BotFather (`/setdomain`, hostname only — no `https://`). Optionally set `MEMBER_SESSION_SECRET` (defaults to a SHA-256 of the bot token).

Local Eve TUI / loopback still uses `localDevMemberAuth()` → `external_auth_id = local-dev`.

## Request flow

1. `proxy.ts` keeps marketing + get-started public. `/app` redirects to `/get-started?verify=1` when no member session cookie is present. Protected APIs fail closed in handlers.
2. Handlers call `requireAuthenticatedMember()` (`lib/auth/member.ts`), which reads the member-session cookie.
3. Telegram deep-link minting (`POST /api/telegram/link`) remains for reconnect and web Login Widget fallback.
4. Web chat sends the member-session JWT as `Authorization: Bearer …` via `/api/auth/token`.
5. Eve auth walk: `[memberSessionAuth(), vercelOidc(), localDevMemberAuth()]` — anonymous `none()` stays removed.
6. Tools read `attributes.memberId` through `requireMemberCaller()`.

## Verification

```bash
pnpm test:auth
pnpm test:telegram-login
pnpm test:telegram-link
pnpm typecheck
```
