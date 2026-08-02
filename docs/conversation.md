# Canonical conversation

Gravy Scout stores one member-owned conversation timeline in Postgres. Web and Telegram each keep their own Eve session cursor; the product timeline is shared.

## Module

`agent/lib/conversation.ts` is the only write path for conversation rows:

- `createConversation` / `listConversations` / `getConversation`
- `appendMessage` (idempotent on `idempotency_key`)
- `listMessages` with `(created_at, id)` cursors
- `associateAgentSession` / `getAgentSession` for surface Eve cursors
- `beginSurfaceTurn` / `completeSurfaceTurn` / `syncSurfaceSessionCursor`
- `projectContextForSurface` for bounded history when opening a new surface session

Callers pass the verified internal `memberId` from the identity module. Client-supplied member ids are rejected in the HTTP layer.

## Ordering and concurrency

- Canonical order is `messages.created_at`, then `messages.id`.
- Web and Telegram may append concurrently; each surface has its own Eve continuation token, so tokens cannot corrupt each other.
- Replayed idempotency keys return the original row.
- Stream index updates on a surface never rewind (`max(existing, next)`).

## Web flow

1. Signed-in client lists/creates conversations via `/api/conversations`.
2. On send, `POST .../turns` with `action: "begin"` records the member message and returns any existing Eve cursor plus optional context prefix.
3. The browser uses `useEveAgent` to start or continue the Eve HTTP session (live stream).
4. Mid-stream, `action: "sync"` persists `sessionId` / `continuationToken` / `streamIndex`.
5. On finish, `action: "complete"` stores the assistant message once and updates the surface summary.

Durable messages are the read model after reload. Clearing browser storage does not delete conversation history.

## Verification

```bash
pnpm db:migrate
pnpm test:conversation
pnpm test:database
pnpm test:auth
pnpm typecheck
```
