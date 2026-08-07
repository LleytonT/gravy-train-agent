# ADR 0004 — Telegram Login as primary web authentication

## Status

Accepted for GS-008.

## Context

GS-002 provisioned Clerk for multi-member web auth. Product intent is Telegram-first: digests and sync already use a verified Telegram user ID. Forcing Clerk sign-in on the first visit blocked exploration and duplicated identity when members only care about Telegram verification.

## Decision

1. Public product pages and progressive onboarding do not require authentication.
2. Entering the secure app shell (`/app`) requires a verified member session.
3. **Telegram Login Widget** is the primary web verification path. A verified Telegram user ID creates or resolves the internal member and binds the channel identity.
4. Clerk remains an optional secondary path for members who prefer email, and for environments where Telegram Login is unavailable.
5. Eve accepts minted member-session JWTs (`memberSessionAuth`) ahead of Clerk.

## Consequences

- Members can see first recommendations before verifying.
- Telegram is both channel and primary identity proof for web entry.
- Clerk keys are no longer required for the happy path.
- BotFather should allow the production domain (`gravy.sh`) for the Login Widget via `/setdomain`.
- When the widget domain is missing, web auth falls back to a one-time deep-link login challenge (pending member + `/start` consume + browser poll) so “Bot domain invalid” does not block entry.
- Deep-link tokens also remain useful for reconnect flows and non-Login channel binding.
