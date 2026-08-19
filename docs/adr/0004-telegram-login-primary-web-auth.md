# ADR 0004 — Telegram Login as primary web authentication

## Status

Superseded by [ADR 0005](./0005-telegram-only-member-auth.md). Telegram Login remains the web verification path; Clerk is removed entirely.

## Context

GS-002 provisioned Clerk for multi-member web auth. Product intent is Telegram-first: digests and sync already use a verified Telegram user ID. Forcing Clerk sign-in on the first visit blocked exploration and duplicated identity when members only care about Telegram verification.

## Decision

1. Public product pages and progressive onboarding do not require authentication.
2. Entering the secure app shell (`/app`) requires a verified member session.
3. **Telegram Login Widget** is the web verification path. A verified Telegram user ID creates or resolves the internal member and binds the channel identity.
4. ~~Clerk remains an optional secondary path.~~ Removed in ADR 0005.
5. Eve accepts minted member-session JWTs (`memberSessionAuth`).

## Consequences

- Members can see first recommendations before verifying.
- Telegram is both channel and identity proof for web entry.
- When the widget domain is missing, web auth falls back to a one-time deep-link login challenge (pending member + `/start` consume + browser poll).
- Deep-link tokens also remain useful for reconnect flows and non-Login channel binding.
