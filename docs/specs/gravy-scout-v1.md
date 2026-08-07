# Gravy Scout v1 product specification

Status: ready to decompose into implementation tickets.

## Problem Statement

People searching for high-fit career opportunities must monitor fragmented job boards, inbox alerts, company news, public social posts, funding announcements, financial records, and hiring movements. Conventional job alerts over-index on advertised roles and exact keywords. They miss companies that are about to hire, adjacent roles a person could plausibly grow into, and the evidence needed to decide whether an opportunity is worth pursuing.

The current prototype demonstrates scoring, dossiers, web chat, and Telegram delivery, but its single-member assumptions prevent it from becoming the intended product. Identity is anonymous or channel-specific, profile state is stored in a shared Markdown file, chat history is browser-local, and production data may fall back to ephemeral storage. Web and Telegram therefore do not share a real conversation.

## Solution

Build Gravy Scout as a multi-member, evidence-backed opportunity agent with:

- a polished web onboarding and daily workspace,
- a synchronized web and Telegram conversation,
- a member-specific inbound email address for job-board alerts,
- continuous research across public company, news, hiring, and financial sources,
- a structured career profile that improves through explicit feedback,
- transparent opportunity scoring with citations and next actions, and
- an Eve architecture that separates deterministic data workflows from agentic research and explanation.

The first release focuses on trusted discovery and learning. It does not apply for roles or send outreach autonomously.

## User Stories

1. As a visitor, I want to understand what Gravy Scout discovers beyond a normal job board, so that I can decide whether to sign up.
2. As a member, I want secure account access, so that my career and communication data are private.
3. As a new member, I want a short progressive setup, so that I receive value before completing a long profile.
4. As a new member, I want to enter my current role, experience, location, and goals, so that recommendations start relevant.
5. As a new member, I want to upload or paste a résumé, so that I do not have to retype my work history.
6. As a new member, I want to specify hard constraints such as location, work authorization, compensation, travel, and remote preference, so that impossible roles are excluded.
7. As a new member, I want to specify ambitions and curiosities, so that Gravy Scout can surface useful non-obvious opportunities.
8. As a member, I want to review and correct my career profile, so that inferred facts do not become hidden assumptions.
9. As a member, I want explicit choices to override inferred preferences, so that Gravy Scout respects what I actually said.
10. As a member, I want a unique email address for job alerts, so that I can subscribe on LinkedIn, Seek, Indeed, and other boards without granting mailbox-wide access.
11. As a member, I want clear forwarding instructions, so that existing alerts can reach Gravy Scout with minimal setup.
12. As a member, I want duplicate alerts collapsed, so that the same listing from several boards does not create noise.
13. As a member, I want listing links canonicalized and checked for freshness, so that recommendations do not lead to stale or tracking-heavy URLs.
14. As a member, I want Gravy Scout to research companies showing expansion signals, so that I hear about likely hiring before a matching role is advertised.
15. As a member, I want public news, careers pages, funding, filings, leadership changes, and regional activity considered, so that recommendations use broader evidence.
16. As a member, I want every material claim to cite a source and observed date, so that I can judge its credibility.
17. As a member, I want advertised, rumored, and inferred roles clearly distinguished, so that confidence is not overstated.
18. As a member, I want recommendations ranked against my profile and constraints, so that the most actionable opportunities appear first.
19. As a member, I want each opportunity to explain fit, risk, evidence, confidence, and a next action, so that I can act without repeating the research.
20. As a member, I want surprising but plausible opportunities included, so that exact-title matching does not trap me in my current lane.
21. As a member, I want to save, dismiss, pursue, or mark an opportunity not relevant, so that I can manage a working shortlist.
22. As a member, I want to explain why I dismissed an opportunity, so that future ranking improves.
23. As a member, I want notification controls for urgency, cadence, quiet hours, and channels, so that Gravy Scout helps without becoming noisy.
24. As a member, I want a concise digest when meaningful evidence changes, so that I do not receive padded daily messages.
25. As a member, I want to link Telegram from my signed-in web account, so that another person's Telegram account cannot be linked accidentally.
26. As a member, I want Telegram linking to use a short-lived one-time token, so that usernames and guessable links are insufficient.
27. As a member, I want messages sent on Telegram to appear in the web conversation, so that I can continue on either surface.
28. As a member, I want messages sent on the web to appear in Telegram when appropriate, so that the conversation feels continuous.
29. As a member, I want one consistent Gravy Scout memory across surfaces, so that I do not repeat my background and preferences.
30. As a member, I want to start a fresh conversation without deleting my durable profile and feedback, so that topic history and long-term memory are distinct.
31. As a member, I want Gravy Scout to ask focused questions when uncertainty materially affects ranking, so that setup remains conversational rather than exhaustive.
32. As a member, I want to see which facts are explicit, imported, or inferred, so that personalization is transparent.
33. As a member, I want to disconnect Telegram or email access, so that revocation is immediate and understandable.
34. As a member, I want to export and delete my account data, so that I control sensitive career information.
35. As a member, I want Gravy Scout to draft outreach, so that I can act faster.
36. As a member, I want explicit approval required before any external message or application, so that the agent cannot impersonate me.
37. As an operator, I want inbound webhooks verified and deduplicated, so that forged or repeated events do not corrupt member data.
38. As an operator, I want discovery runs to be idempotent and observable, so that retries do not duplicate opportunities or digests.
39. As an operator, I want expensive research bounded by source, tool, and model limits, so that costs are predictable.
40. As an operator, I want each opportunity score versioned with its inputs, so that ranking regressions can be investigated.
41. As an operator, I want agent evals for memory, citations, tools, and notification behavior, so that prompt and model changes are safe.
42. As a developer learning Eve, I want capabilities placed in Eve's documented filesystem slots, so that the framework remains legible.
43. As a developer learning Cursor agents, I want small, agent-ready tickets with explicit dependencies and acceptance checks, so that parallel agents can work safely.

## Implementation Decisions

- The product is multi-member from the first production slice. No new feature may depend on process-global or filesystem-global member state.
- Neon Postgres with Drizzle is the system of record. Schema changes use committed migrations; runtime `CREATE TABLE IF NOT EXISTS` is removed after migration.
- Clerk provides end-member authentication. The internal member identifier is stable and provider-agnostic.
- Eve remains the agent runtime. Its native Telegram channel is retained; Chat SDK is not added because Eve implements its own channel runtime.
- A product-level canonical conversation is stored independently of Eve's surface-specific sessions. Channel messages are bridged into that conversation.
- Telegram is linked with an authenticated, short-lived, single-use deep-link token. Telegram usernames are display metadata only.
- The minimum viable job-alert integration is a unique inbound email address per member. Broad mailbox OAuth is deferred until the lower-permission flow proves insufficient.
- Source adapters normalize immutable source items behind one ingestion interface. Source types are data, not a closed TypeScript enum that requires application logic changes.
- Signals cite source items. Opportunities cite signals. Unsupported model claims are not persisted as evidence.
- Company dossiers are shared intelligence. Career profiles, conversations, opportunities, feedback, connections, and deliveries are member-scoped.
- Deterministic code controls idempotency, state transitions, scoring thresholds, retries, and delivery cooldowns. Models perform extraction, fit analysis, research synthesis, and response drafting.
- Research uses specialist Eve subagents with constrained tools and structured outputs.
- The web app uses shadcn/ui primitives and organizes the signed-in experience around Today, Opportunities, Conversation, and Profile & connections.
- The agent may draft outreach but external side effects require explicit human approval.
- Production web access removes anonymous Eve HTTP authentication.
- Full private email bodies and documents have explicit retention policies. Stored evidence defaults to the minimum excerpt and metadata needed for traceability.

## Testing Decisions

- Tests target external behavior at the highest stable seam: one inbound source item should produce the expected stored evidence and member-visible outcome.
- The primary end-to-end fixture covers inbound job-alert email → normalized source item → candidate role → scored opportunity → digest → synchronized web/Telegram conversation.
- Identity tests prove that two members cannot read or mutate each other's profile, conversations, opportunities, link tokens, or deliveries.
- Linking tests prove that tokens expire, are single-use, are bound to the initiating member, and cannot be substituted with a Telegram username.
- Ingestion contract tests are shared by every source adapter and cover signature verification, deduplication, canonical URLs, retries, and malformed content.
- Opportunity tests assert constraints, evidence citations, score-version persistence, cooldowns, and state transitions without asserting model wording.
- Eve evals assert successful runs, expected tool/subagent use, preference persistence, citation behavior, no-op digest behavior, and refusal to perform unapproved external actions.
- Conversation tests assert one canonical ordered timeline despite duplicate webhooks, reconnects, channel changes, and concurrent messages.
- UI walkthroughs cover onboarding, alert-address setup, Telegram linking, opportunity disposition, and channel synchronization.
- Existing deterministic scoring and personalization smoke scripts remain as regression checks until replaced by equivalent module tests.

## Out of Scope

- Scraping a member's LinkedIn feed or job board with stored browser credentials.
- Automating LinkedIn messages through unsupported or unofficial APIs.
- Autonomous job applications, outreach, follows, likes, posts, or direct messages.
- A recruiter or employer marketplace.
- Native mobile applications.
- Full email-client behavior or unrestricted mailbox search in the first release.
- Guaranteed prediction of unpublished roles.
- Training custom foundation models.
- Multi-language support in the first release.
- Replacing evidence-backed recommendations with a generic web-search chatbot.

## Further Notes

- The existing deterministic scoring, role affinity, personalization, and dossier concepts should be retained where their behavior remains valid.
- Existing local capture scripts may remain a developer-only experiment, but they are not part of the production member journey.
- The product name is **Gravy Scout**. “Gravy train” may be used as brand voice, not as a domain object.
- Mobbin design research remains an explicit prerequisite for the visual implementation phase because the requested MCP server is not available in the current environment.
