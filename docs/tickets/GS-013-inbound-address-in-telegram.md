# GS-013 — Inbound address in Telegram

Parent: [GS-010](./GS-010-telegram-native-agent.md). Spec: `docs/specs/telegram-native-agent.md`.

**Blocked by:** [GS-011](./GS-011-cold-start-telegram-member.md)

**Status:** ready-for-agent

## Goal

Once a **career profile** is usable, the bot gives the **member** their unique **inbound address** and forwarding instructions in Telegram.

## What to build

Reuse the existing inbound-alias **connection** module. After the **career profile** is usable, Telegram sends the address. “What’s my alert email?” returns the same active address. Revoke/rotate in the thread. Mail to that address still becomes **source items** as today. Do not add a website Profile flow for this slice.

## Interface

Ingestion/connection module remains the only place that mints or revokes aliases. The agent or a dedicated tool asks that module; the Telegram adapter does not parse Resend payloads.

## Acceptance checks

- [ ] After a usable **career profile**, the member can obtain exactly one active **inbound address** via Telegram, with forwarding instructions in the same turn.
- [ ] Asking again returns that same address, not a second alias.
- [ ] Revoke/rotate in Telegram stops attribution to the old address.
- [ ] Mail to the active address still ingest as **source items**; unsigned webhooks still fail closed.

## Not in scope

Mailbox OAuth, new source adapters, dashboard Profile UI, **digest** delivery, **proposed action**, get-started page.
