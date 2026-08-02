# GS-006 — Inbound job-alert email

Blocked by: GS-001 and GS-002.

## Goal

Let each member subscribe to or forward job-board alerts without granting Gravy Scout broad mailbox access.

## Scope

- Discover and provision an inbound-email provider through the Vercel Marketplace before implementation.
- Generate one revocable inbound address or alias per member.
- Verify provider webhooks and map the recipient alias to a member.
- Parse common LinkedIn, Seek, Indeed, and generic job-alert messages through adapter fixtures.
- Normalize listings into immutable source items with canonical URLs and content hashes.
- Deduplicate cross-board and repeated alerts.
- Store minimal excerpts and apply a documented full-body retention policy.
- Show setup instructions and ingestion status in Profile & connections.

## Interface

Every source adapter emits the same normalized source-item contract. Downstream intelligence does not know email-provider payloads.

## Acceptance checks

- Forged or unsigned webhooks are rejected.
- Webhook retries do not duplicate source items.
- One email containing several listings creates the correct distinct items.
- The same listing from two boards is linked or collapsed deterministically.
- Invalid mail is quarantined with an observable error, not silently dropped.
- Revoking an alias prevents further member attribution.

## Not in scope

Full Gmail access, sending email as the member, or mailbox search.
