# GS-010 — Telegram-native agent

Blocked by: none (GS-001–GS-009 landed).

Status: ready-for-agent

Spec: `docs/specs/telegram-native-agent.md`

## Goal

Make Gravy Scout a Telegram contact: first private message creates the **member**, the website only opens the bot, **digests** and **inbound address** arrive in Telegram, and each **proposed action** needs a per-event yes.

## Interface

The identity module upserts a **member** from a verified Telegram user ID on the talk **surface**. The Telegram channel adapter uses that module, then the conversation bridge. Career profile, inbound **connection**, discovery **digest**, and **disposition** stay behind their existing modules. **Proposed action** is a new durable record approved only in Telegram.

## Acceptance checks

- An unknown Telegram user ID can `/start` or send a first DM and receive a reply; no website sign-in is required.
- The same user ID continues the same **conversation**; a username change does not fork the **member**.
- After a usable **career profile**, Telegram can issue the **inbound address**.
- A material **discovery run** sends a **digest** on Telegram; a no-op run does not.
- An unapproved **proposed action** does not execute.
- Get-started opens the bot. There is no member-facing web chat composer.

## Not in scope

Dashboard UI, web transcript, standing approvals, application object, WhatsApp, mailbox OAuth, new source adapters.

Decompose further with `/to-tickets` before splitting across parallel agents.
