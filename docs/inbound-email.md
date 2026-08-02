# Inbound job-alert email

Gravy Scout captures LinkedIn, Seek, Indeed, and generic job-board alerts through a **member-specific inbound address**. Members never grant mailbox-wide OAuth. See ADR 0003 and GS-006.

## Provider

**Resend** is provisioned through the Vercel Marketplace (native messaging integration). It supplies `RESEND_API_KEY` and supports inbound receiving plus Svix-signed webhooks.

```bash
pnpm dlx vercel@latest link --yes \
  --scope lleytons-projects-cacece87 \
  --project gravy-train-agent
pnpm dlx vercel@latest integration add resend --yes
pnpm dlx vercel@latest env pull .env.local --yes
```

Then in the Resend dashboard (or Marketplace-managed team):

1. Enable **Receiving** on a domain — prefer a subdomain such as `alerts.yourdomain.com` or the Resend-managed `*.resend.app` receiving address.
2. Set `RESEND_INBOUND_DOMAIN` to that domain (no `@`).
3. Add a webhook for `email.received` pointing at `https://<deployment>/api/inbound/resend`.
4. Copy the webhook signing secret into `RESEND_WEBHOOK_SECRET`.

## Member aliases

- Each member gets one active `connections` row with `provider = inbound_email`.
- The address is `{random}@RESEND_INBOUND_DOMAIN`. Resend accepts any local-part on the receiving domain; Gravy Scout maps the recipient to `memberId`.
- **Revoke** sets `status = revoked`. Further mail to that address is quarantined as `unknown_or_revoked_alias` and is **not** ingested as member source items.
- Profile still surfaces those quarantine rows by matching `recipient_address` to any alias the member has held (active or revoked).

UI: signed-in **Profile & connections** (`/profile`) shows the address, setup steps, receipt counts, and quarantine errors.

## Ingestion contract

Every adapter emits `SourceItemInput` (`agent/lib/ingestion/types.ts`):

- `sourceType: job_listing` (board is data in `payload.board`, not a TypeScript enum)
- `contentHash` from the canonical job URL (tracking params stripped) so cross-board duplicates collapse
- `source_item_receipts.idempotency_key` = `resend:{emailId}:listing:{index}` so webhook retries do not duplicate

Invalid or unattributable mail lands in `inbound_quarantine` with an observable reason — never silently dropped.

## Retention

Full private bodies are optional and short-lived. Defaults and purge semantics are documented in `agent/lib/ingestion/retention.ts` (`RETENTION_POLICY_DOC`). Evidence excerpts remain. `purgeExpiredFullBodies()` runs opportunistically on each inbound webhook and is covered by `pnpm test:inbound`.

| Field | Retention |
| --- | --- |
| Title, company, location, canonical URL, excerpt, content hash | Kept as evidence |
| `payload.fullBody` / `payload.fullHtml` | Default 7 days (`INBOUND_FULL_BODY_RETENTION_HOURS`) |
| Quarantine excerpt + reason | Kept for operator visibility |

## Verification

```bash
pnpm db:migrate
pnpm test:inbound
pnpm typecheck
```

`test:inbound` covers signature rejection, multi-listing parse fixtures, receipt idempotency, cross-board URL collapse, quarantine, and alias revocation.
