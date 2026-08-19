# Gravy Scout domain language

Use these terms consistently in product, code, prompts, tickets, and tests.

## People and identity

- **Member** — a person with a Gravy Scout account. A member talks to Gravy Scout on Telegram. The web app is a public get-started onramp (open the bot) and, later, a non-agentic dashboard locked with Telegram Login; it is not a talk surface and does not show the conversation. A member may connect several sources.
- **Career profile** — the structured, member-owned facts Gravy Scout uses to personalize work: experience, skills, constraints, ambitions, preferences, and explicit feedback.
- **Preference** — a durable member choice that affects discovery or ranking. Preferences have provenance and may be explicit or inferred; inferred preferences must never silently override explicit ones.
- **Channel identity** — an external identity that belongs to a member, such as a Telegram user ID. It is established by the channel itself. A username is display metadata, not identity.
- **Connection** — revocable authorization for Gravy Scout to read a member-controlled source such as Gmail. A connection is not a channel identity.

## Opportunity intelligence

- **Source item** — immutable content received from a source: a job-alert email, job listing, news article, company update, filing, or public social post.
- **Signal** — a cited fact derived from one or more source items that may change a company's hiring likelihood or a member's fit.
- **Company dossier** — the current, evidence-backed view of a company assembled from signals. It is shared intelligence, not member-specific.
- **Candidate role** — an advertised, rumored, or inferred role that may fit one or more members.
- **Opportunity** — a member-specific hypothesis connecting a candidate role or company event to that member, with a score, rationale, evidence, confidence, and next action.
- **Discovery run** — one idempotent execution that ingests source items, derives signals, refreshes dossiers, creates or updates opportunities, and decides whether to notify.
- **Digest** — a ranked summary of new or materially changed opportunities delivered to a member on Telegram.

## Conversation

- **Conversation** — the canonical, member-owned timeline of messages with Gravy Scout. Members talk on Telegram. The web app is not a talk surface and does not show this timeline.
- **Message** — one immutable entry in a conversation, attributed to a member, Gravy Scout, or the system and tagged with its originating surface.
- **Surface** — a place where a member talks to Gravy Scout. The talk surface is `telegram`.
- **Agent session** — Eve's durable execution context for one surface continuation. Agent sessions are runtime machinery; they are not the product-level conversation.
- **Conversation bridge** — the module that records channel messages in the canonical conversation and supplies relevant shared context to an Eve agent session.

## Feedback and actions

- **Disposition** — a member's explicit response to an opportunity: `saved`, `dismissed`, `pursuing`, or `not_interested`. Applied or in-progress jobs are **opportunities** with `pursuing`; there is no separate application object.
- **Feedback event** — an append-only record of a correction, preference change, or opportunity disposition used to improve future ranking.
- **Proposed action** — an external side effect drafted by Gravy Scout and executed only after the member approves it, such as sending outreach or applying. Approval may be one-shot or standing.

## Terms to avoid

- **User** when the domain means a signed-in person; use **member**.
- **Raw item**; use **source item**.
- **Ping**; use **notification** or **digest**.
- **LinkedIn profile ingestion** when the member supplied career history manually or by résumé; name the actual source.
- **Synced session**; members share one **conversation**, while Eve sessions remain transport-specific.
- **Web chat** or treating the web app as a place to talk to Gravy Scout; the talk **surface** is Telegram.
- **Telegram verification** when the member is proving who they are by messaging the bot; that is **channel identity**. **Telegram Login** is only a later dashboard lock, never a prerequisite to talk.
- **Application** as a domain object; use an **opportunity** with **disposition** `pursuing`.
