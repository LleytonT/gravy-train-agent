# Gravy Scout domain language

Use these terms consistently in product, code, prompts, tickets, and tests.

## People and identity

- **Member** — a person with a Gravy Scout account. A member may use several surfaces and connect several sources.
- **Career profile** — the structured, member-owned facts Gravy Scout uses to personalize work: experience, skills, constraints, ambitions, preferences, and explicit feedback.
- **Preference** — a durable member choice that affects discovery or ranking. Preferences have provenance and may be explicit or inferred; inferred preferences must never silently override explicit ones.
- **Channel identity** — an external identity linked to a member, such as a Telegram user ID. A username is display metadata, not identity.
- **Connection** — revocable authorization for Gravy Scout to read a member-controlled source such as Gmail. A connection is not a channel identity.
- **Intake** — the first Telegram conversation that collects career-profile facts (identity, target roles, company thesis, regions, résumé, digest cadence) before digests start. Distinct from the public web get-started preview.

## Opportunity intelligence

- **Source item** — immutable content received from a source: a job-alert email, job listing, news article, company update, filing, or public social post.
- **Signal** — a cited fact derived from one or more source items that may change a company's hiring likelihood or a member's fit.
- **Company dossier** — the current, evidence-backed view of a company assembled from signals. It is shared intelligence, not member-specific.
- **Candidate role** — an advertised, rumored, or inferred role that may fit one or more members.
- **Opportunity** — a member-specific hypothesis connecting a candidate role or company event to that member, with a score, rationale, evidence, confidence, and next action.
- **Discovery run** — one idempotent execution that ingests source items, derives signals, refreshes dossiers, creates or updates opportunities, and decides whether to notify.
- **Digest** — a ranked summary of new or materially changed opportunities delivered to a member.

## Conversation

- **Conversation** — the canonical, member-owned timeline shown across the web app and Telegram.
- **Message** — one immutable entry in a conversation, attributed to a member, Gravy Scout, or the system and tagged with its originating surface.
- **Surface** — a place where a member talks to Gravy Scout, initially `web` or `telegram`.
- **Agent session** — Eve's durable execution context for one surface continuation. Agent sessions are runtime machinery; they are not the product-level conversation.
- **Conversation bridge** — the module that records channel messages in the canonical conversation and supplies relevant shared context to an Eve agent session.

## Feedback and actions

- **Disposition** — a member's explicit response to an opportunity: `saved`, `dismissed`, `pursuing`, or `not_interested`.
- **Feedback event** — an append-only record of a correction, preference change, or opportunity disposition used to improve future ranking.
- **Proposed action** — an external side effect drafted by Gravy Scout but not executed without the member's approval, such as sending outreach.

## Terms to avoid

- **User** when the domain means a signed-in person; use **member**.
- **Raw item**; use **source item**.
- **Ping**; use **notification** or **digest**.
- **LinkedIn profile ingestion** when the member supplied career history manually or by résumé; name the actual source.
- **Synced session**; web and Telegram share a **conversation**, while Eve sessions remain transport-specific.
