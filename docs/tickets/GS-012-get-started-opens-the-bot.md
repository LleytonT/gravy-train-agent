# GS-012 — Get-started opens the bot

Parent: [GS-010](./GS-010-telegram-native-agent.md). Spec: `docs/specs/telegram-native-agent.md`.

**Blocked by:** [GS-011](./GS-011-cold-start-telegram-member.md)

**Status:** ready-for-agent

## Goal

The public website explains that Gravy Scout is a career scout you text, and the only get-started action opens Telegram. There is no member-facing web chat composer.

## What to build

Get-started is an onramp, not an agent. Visitors are not asked to verify with Telegram Login in order to talk. Login Widget code may remain for a later dashboard lock; it is not this journey. `/app` conversation composer is out of the member path (redirect or retire). Eve HTTP for local TUI/operators may stay.

Blocked by GS-011 so web chat is not removed before the bot talks to strangers.

## Interface

Public pages only. No new talk **surface**. No dashboard of **opportunities** or **career profile**.

## Acceptance checks

- [ ] Get-started offers a single primary action that opens the Telegram bot.
- [ ] Talking does not require Telegram Login or a website account.
- [ ] There is no member-facing web chat composer.
- [ ] Marketing copy does not describe WhatsApp or website chat as how you talk to Gravy Scout.

## Not in scope

Building the non-agentic dashboard, showing the **conversation** on the web, Clerk, inbound-address UX, **digest** send, **proposed action**.
