# GS-011 — Cold-start Telegram member

Parent: [GS-010](./GS-010-telegram-native-agent.md). Spec: `docs/specs/telegram-native-agent.md`.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

## Goal

An unknown person can message the Gravy Scout bot (bare `/start` or a first DM) with no website visit and get a real reply as a new **member**.

## What to build

Prove the talk **surface** works for a stranger. A verified Telegram user ID creates or resolves the **member** and **channel identity**, opens the canonical **conversation**, and runs an agent turn. A second message continues the same thread. Usernames stay display metadata. Group chats, other bots, and channel posts are ignored.

`main` already provisions a **member** from a private Telegram user ID. Do not rebuild that. Audit it against the acceptance checks and close the gaps (refusals that still send people to the web, missing tests, `/start` with no payload treated as an error).

## Interface

The identity module upserts from a verified Telegram user ID. The Telegram channel adapter calls that module, then the conversation bridge. Tools keep receiving internal `memberId`. Username-only linking stays rejected.

## Acceptance checks

- [ ] Unknown Telegram user ID, no web session, `/start` without a token → **member** exists and a welcome/agent reply is sent (not “sign in on the web”).
- [ ] First non-command text from an unknown user ID → same outcome.
- [ ] Repeat message from the same user ID → same **member**, additional **conversation** **message**, no second **member**.
- [ ] Two user IDs → two **members**.
- [ ] Username change → same **member**.
- [ ] Group chat → no **member**, no reply.
- [ ] Webhook retry with the same Telegram message id → one **message**.
- [ ] Eve eval or smoke covers unknown Telegram identity onboarded; the old website-gate refusal cannot regress.

## Not in scope

Get-started page copy, removing web chat, issuing the **inbound address**, **digest** delivery, **proposed action**, dashboard, Clerk.
