# GS-014 — Digests arrive in Telegram

Parent: [GS-010](./GS-010-telegram-native-agent.md). Spec: `docs/specs/telegram-native-agent.md`.

**Blocked by:** None — can start immediately (already-linked **members** are enough).

**Status:** implemented on branch (`runDiscovery` → `deliverDigestsForRun` → `sendProactiveTelegramMessage` + conversation row).

## Goal

When a **discovery run** has material **opportunity** changes, the **member** gets a concise **digest** in Telegram. Silence means nothing material happened.

## What to build

Deterministic discovery still decides whether a **digest** is due. On send: Telegram message plus a row on the canonical **conversation**. On no-op: skipped delivery record, no Telegram send. Quiet hours and a revoked **channel identity** suppress proactive send. Idempotent on retry.

Does not wait on GS-011. Cold-start **members** will get **digests** once both this ticket and GS-011 exist.

## Interface

Discovery orchestrator calls the existing Telegram send path and the conversation module. The model does not decide whether database work succeeded or who was notified.

## Acceptance checks

- [x] Material **discovery run** for a consenting **member** → Telegram **digest** and a **conversation** **message**.
- [x] No material changes → skipped delivery, no Telegram send, no fabricated **opportunities**.
- [x] Quiet hours or revoked **channel identity** → no proactive send.
- [x] Retry of the same **discovery run** does not double-send.
- [x] Existing discovery no-op eval/smoke still passes.

## Not in scope

Cold-start identity, get-started UI, **inbound address** issuance, **proposed action**, dashboard, new research adapters.

## Implementation notes

- Seam: `agent/lib/telegram-send.ts` → `sendProactiveTelegramMessage`; discovery calls it from `deliverDigestsForRun`.
- Docs: `docs/discovery.md`
- Verify: `pnpm test:discovery` + `pnpm test:evals` (empty-noop-digest)
