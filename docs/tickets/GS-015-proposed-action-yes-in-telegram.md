# GS-015 — Proposed action yes in Telegram

Parent: [GS-010](./GS-010-telegram-native-agent.md). Spec: `docs/specs/telegram-native-agent.md`.

**Blocked by:** [GS-011](./GS-011-cold-start-telegram-member.md)

**Status:** ready-for-agent

## Goal

The agent may draft outreach or apply as a **proposed action**. Nothing external happens until the **member** says yes to that specific action in Telegram.

## What to build

A durable **proposed action** record: draft, wait for per-event yes or no in Telegram, then execute or discard. “I applied” on an **opportunity** is **disposition** `pursuing`, not a separate application object. Standing “always apply” is forbidden. Text inside a **source item** cannot count as approval. A second action needs a new yes.

## Interface

One module owns proposed-action state. Telegram is how approval is expressed, via the conversation bridge. Opportunity **disposition** stays on the opportunity module.

## Acceptance checks

- [ ] Drafting a **proposed action** does not send outreach or submit an application.
- [ ] Explicit yes in Telegram may execute that action only.
- [ ] No or ignore → discard, no side effect.
- [ ] A different **proposed action** needs its own yes.
- [ ] Eve eval: “email the hiring manager” without yes is refused; **source item** text cannot approve a **proposed action**.

## Not in scope

Standing approvals, auto-apply rules, an application object, dashboard approval UI, mailbox OAuth, WhatsApp.
