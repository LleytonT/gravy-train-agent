# GS-004 — Canonical conversation bridge

Status: implemented.

Blocked by: GS-001 and GS-002.

## Goal

Replace browser-local thread storage with one durable conversation timeline shared by all surfaces.

## Scope

- Persist conversations, messages, idempotency keys, cursors, and surface-specific Eve session references.
- Add a conversation bridge that records inbound messages, starts or resumes the correct Eve surface session, and records completed assistant messages once.
- Replace web `localStorage` threads with server-backed listing and pagination.
- Stream active Eve events for responsiveness while treating stored messages as the durable read model.
- Define ordering and conflict behavior for concurrent web and Telegram messages.
- Add bounded context projection or summaries for surface switches.

## Interface

The conversation module appends an idempotent message, reads from a cursor, associates an Eve session, and emits member-authorized updates.

## Acceptance checks

- A conversation survives browser storage deletion and a server cold start.
- Replayed webhooks or reconnects do not duplicate messages.
- Only the owning member can read a conversation or its Eve session reference.
- A fresh conversation does not erase the member's career profile or feedback.
- Concurrent messages have deterministic ordering and do not corrupt continuation tokens.
- The web UI can recover after disconnecting mid-stream.

## Not in scope

Telegram account linking or final visual redesign.

## Implementation notes

- Module: `agent/lib/conversation.ts` — append/list/associate/begin/complete + context projection.
- HTTP: `/api/conversations` and nested `messages`, `session`, `turns` routes (Clerk member only).
- Web UI loads conversations/messages from the server; Eve streaming remains for live turns; `localStorage` thread event logs are removed.
- One Eve session cursor per `(conversation_id, surface)` (`drizzle/0005_agent-session-surface.sql`).
- Verify with `pnpm test:conversation`.
