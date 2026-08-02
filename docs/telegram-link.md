# Secure Telegram linking

Gravy Scout links Telegram with a short-lived, single-use deep-link token minted by a signed-in member. Telegram usernames are display metadata only.

## Flow

1. Signed-in member calls `POST /api/telegram/link` (or Eve tool `save_messaging_destination` with `action=link`).
2. Identity module stores a SHA-256 hash of a random token and returns `https://t.me/<bot>?start=<token>`.
3. Member opens the link and taps Start. Eve's Telegram webhook verifies `X-Telegram-Bot-Api-Secret-Token`, then `onMessage` consumes the token.
4. `consumeTelegramLinkToken` binds the verified Telegram **user ID** to the minting member, marks the token used, and updates messaging consent/chat id.
5. Later inbound messages resolve `telegram user id → memberId` and route through the canonical conversation bridge (`beginSurfaceTurn` / `completeSurfaceTurn`).

## Rules

- Expired, replayed, malformed, or already-used tokens are rejected.
- Tokens belong only to the member who created them.
- An active Telegram identity cannot silently move to another member (conflict until revoked).
- Username changes update display metadata; identity remains the Telegram user ID.
- `DELETE /api/telegram/link` sets `revoked_at` and clears chat id — proactive delivery stops immediately.
- Quiet hours live on the messaging destination and skip proactive sends.
- Delivery attempts write `digest_deliveries` with a unique idempotency key.

## Module seam

Only `agent/lib/identity.ts` creates/consumes link tokens and reads/writes `channel_identities`. Callers pass the internal `memberId`.

## Verification

```bash
pnpm db:migrate
pnpm test:telegram-link
pnpm test:conversation
pnpm test:auth
pnpm typecheck
```
