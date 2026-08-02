# GS-002 — Authentication and member context

Blocked by: GS-001.

## Goal

Give every web request and Eve turn a verified internal `memberId`, and remove anonymous production access.

## Scope

- Provision Clerk through the supported Vercel path.
- Add sign-up, sign-in, sign-out, and protected app routes.
- Resolve Clerk subjects to internal members through the identity module.
- Protect onboarding, conversation, profile, opportunity, and Eve HTTP routes.
- Define how authenticated member context reaches Eve tools without trusting client-supplied IDs.
- Keep local Eve development access explicit and non-production.

## Interface

The identity module resolves a request or verified channel principal to an internal member. Feature modules accept only that internal identifier.

## Acceptance checks

- Anonymous visitors can access only public product pages and auth entry points.
- An authenticated member can complete protected requests.
- A client-supplied member ID cannot change the resolved member.
- Two members cannot access each other's resources.
- Eve's deployed HTTP channel no longer includes anonymous authentication.
- Local development remains documented and usable.

## Not in scope

Telegram linking, organization accounts, billing, or admin roles.
