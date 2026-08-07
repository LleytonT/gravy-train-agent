# ADR 0003: Forwarded job alerts before mailbox OAuth

Status: accepted for v1.

## Context

Job-board scraping is unreliable and broad mailbox access creates material security, privacy, consent, and provider-review costs. The primary information needed from a mailbox is already available in job-alert emails that members can deliberately route to Gravy Scout.

## Decision

Give each member a unique inbound email address and instruct them to subscribe or forward alerts from LinkedIn, Seek, Indeed, and other boards. Verify inbound provider webhooks, normalize listings behind one ingestion interface, and retain only the evidence needed by the product.

Add mailbox OAuth later only if measured member needs cannot be met through forwarding. Any later connection must be scoped, revocable, and implemented through managed OAuth infrastructure.

## Alternatives considered

- **LinkedIn browser scraping:** operationally fragile, difficult to deploy, and incompatible with the intended onboarding.
- **Immediate Gmail/Outlook OAuth:** higher setup friction and much broader data access than the first release needs.
- **Manual URL submission only:** useful as a fallback but too much ongoing member effort.

## Consequences

- The first release can support many job boards without board-specific authentication.
- Email parsing needs fixture coverage and a visible quarantine path.
- Some members will need forwarding setup help.
- Replying or sending as the member remains out of scope.
