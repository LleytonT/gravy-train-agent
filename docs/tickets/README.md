# Gravy Scout implementation map

These are tracer-bullet tickets for independent Cursor agents. Complete them in dependency order; do not begin with source integrations or visual polish before the identity and persistence foundation exists.

| Ticket | Outcome | Blocked by |
| --- | --- | --- |
| [GS-001](./GS-001-production-data-foundation.md) | Multi-member Postgres system of record | — |
| [GS-002](./GS-002-auth-and-member-context.md) | Authenticated member context | GS-001 |
| [GS-003](./GS-003-career-profile.md) | Structured profile and feedback | GS-001, GS-002 |
| [GS-004](./GS-004-canonical-conversation.md) | Server-persisted conversation bridge | GS-001, GS-002 |
| [GS-005](./GS-005-telegram-link-and-sync.md) | Secure Telegram linking and sync | GS-004 |
| [GS-006](./GS-006-inbound-job-alerts.md) | Job-alert email ingestion | GS-001, GS-002 |
| [GS-007](./GS-007-discovery-pipeline.md) | Evidence-backed discovery orchestration | GS-003, GS-006 |
| [GS-008](./GS-008-product-ui.md) | Shadcn onboarding and workspace (Telegram-first deferred auth) | GS-003, GS-004, GS-007 |
| [GS-009](./GS-009-eve-evals.md) | Agent behavior regression suite | GS-003, GS-004, GS-007 |
| [GS-010](./GS-010-telegram-native-agent.md) | Telegram-native spec (parent) | GS-001–GS-009 landed |
| [GS-011](./GS-011-cold-start-telegram-member.md) | Cold-start Telegram **member** | — (audit `main`; do not rebuild) |
| [GS-012](./GS-012-get-started-opens-the-bot.md) | Get-started opens the bot; no web chat | GS-011 |
| [GS-013](./GS-013-inbound-address-in-telegram.md) | **Inbound address** issued in Telegram | GS-011 |
| [GS-014](./GS-014-digests-arrive-in-telegram.md) | **Digests** arrive in Telegram | — |
| [GS-015](./GS-015-proposed-action-yes-in-telegram.md) | **Proposed action** needs a per-event yes | GS-011 |

## Shared rules

- Read `CONTEXT.md`, `docs/specs/gravy-scout-v1.md`, `docs/specs/telegram-native-agent.md`, and `docs/architecture/target-architecture.md` first. For talk **surface** and member creation, prefer the Telegram-native spec and ADR-0005–0007 over the v1 web-chat / Clerk-first sections.
- Prefer deep modules with one high-level test seam.
- Do not preserve single-member filesystem or browser-local state behind compatibility wrappers.
- Add migrations for data changes.
- Include automated verification and, for UI work, a browser walkthrough artifact.
- Update this map if a ticket discovers a new blocking edge.
