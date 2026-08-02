# ADR 0002: Canonical conversation over a cross-channel Eve session

Status: accepted for the target architecture.

## Context

The product promises that web and Telegram chats synchronize. The prototype stores web events in browser `localStorage`, while Telegram owns a separate Eve continuation token and principal. Eve channels intentionally own channel-local continuation tokens, so calling two transport sessions “the same session” would misrepresent the runtime contract.

## Decision

Store a member-owned canonical conversation and immutable messages in Postgres. Bridge each surface-specific Eve session to that conversation, persist completed messages idempotently, and provide relevant shared history or summaries when a surface session runs.

The canonical conversation is the product concept. Eve sessions remain surface-specific runtime concepts.

## Alternatives considered

- **Browser storage plus Telegram history:** cannot synchronize, authorize, or recover reliably.
- **Force both surfaces to reuse one built-in continuation token:** violates channel ownership and complicates delivery, authentication, and cancellation.
- **Use Chat SDK as a second chat runtime:** Eve explicitly implements its own channel runtime; adding another would create duplicate session, webhook, and state models.

## Consequences

- The application owns message ordering, idempotency, pagination, and member authorization.
- Eve event streams still power live progress and observability.
- Context projection and summarization are required when moving between surface sessions.
- Tests must distinguish canonical message durability from Eve run events.
