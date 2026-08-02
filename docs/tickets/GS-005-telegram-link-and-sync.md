# GS-005 — Secure Telegram linking and synchronization

Blocked by: GS-004.

## Goal

Let a signed-in member securely link Telegram and continue the same canonical conversation on web or Telegram.

## Scope

- Generate a cryptographically random, short-lived, single-use Telegram deep-link token for the authenticated member.
- Consume the token on `/start`, bind the verified Telegram user ID, and discard it after one use.
- Reject username-only linking and prevent one Telegram identity from silently moving between members.
- Route inbound and outbound Telegram messages through the conversation bridge.
- Persist consent, quiet hours, delivery status, and revocation.
- Preserve Eve Telegram webhook verification and human-in-the-loop behavior.

## Interface

The identity module creates and consumes link tokens. The Telegram channel resolves a verified Telegram user ID to a member, then calls the conversation bridge.

## Acceptance checks

- Expired, replayed, malformed, or already-used tokens are rejected.
- The link belongs to the authenticated member who created it.
- Telegram and web show the same ordered messages without duplicates.
- Revocation immediately stops proactive delivery.
- Telegram usernames can change without breaking identity.
- Webhook retries are idempotent.

## Not in scope

Group chats, multiple Telegram identities per member, or WhatsApp fallback.
