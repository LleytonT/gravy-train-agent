# ADR 0005 — Telegram user ID is the only end-member authenticator

Clerk is removed. Members are created and resolved from a verified Telegram user ID — either by texting the bot in a private chat or by completing Telegram Login on the web. Other messaging channels can be added later behind the same identity module; they are not present in the runtime today.

## Status

Accepted. Supersedes the Clerk-optional path in ADR 0004.

## Context

GS-002 provisioned Clerk as managed web auth. ADR 0004 made Telegram Login primary and left Clerk as an unused optional email path. The product is accessed primarily by texting Telegram. Clerk packages, Marketplace keys, `/sign-in` routes, and Eve `clerkMemberAuth()` were weight with no member-facing job.

Resend stays: it is the inbound job-alert mailbox (`gs_…@gravy.sh`), not a login system. Twilio WhatsApp is deferred with other future channels.

## Decision

1. Do not depend on Clerk (or any email/password IdP) for member authentication.
2. A verified Telegram user ID creates or resolves the internal member and binds `channel_identities`.
3. The web app uses Telegram Login (widget or deep-link challenge) to mint `gs_member_session` JWTs for `/app` and Eve HTTP.
4. Eve HTTP auth is `memberSessionAuth()` → `vercelOidc()` → `localDevMemberAuth()`. Anonymous `none()` remains forbidden.
5. Username-only linking stays rejected. Identity is the Telegram user ID.

## Consequences

- Texting the bot is enough to become a member; web onboarding is optional.
- Clerk Marketplace resources and `CLERK_*` env vars can be removed from the Vercel project.
- Re-adding email auth later would be a new IdP behind the identity module, not a restoration of the Clerk walk.
