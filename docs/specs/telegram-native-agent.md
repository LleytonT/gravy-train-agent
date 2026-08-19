# Telegram-native Gravy Scout

Status: ready-for-agent. Revises the v1 web-chat and Clerk/Login-first journeys. Domain language is `CONTEXT.md`. Binding decisions: ADR-0002 (narrowed by ADR-0006), ADR-0003 (extended by ADR-0007), ADR-0005 (supersedes ADR-0004).

## Problem Statement

A member who wants a career scout has to sign in on a website, bind Telegram with a special link, and then chat in a web app. The bot will not talk until that website dance is done. The product therefore feels like a dashboard with a chat widget, not like a contact you text. People already live in Telegram. They should be able to message Gravy Scout immediately, the way they would message Poke, and get opportunity intelligence, not a login wall.

## Solution

Gravy Scout is a Telegram contact. The first private message creates the **member**. The member talks only on Telegram: career snapshot, **inbound address**, **opportunities**, **dispositions**, and yes/no on each **proposed action**. **Digests** arrive in that same thread. The website explains the product and opens the bot. A later non-agentic dashboard may exist; this spec does not build it. Web chat is gone.

## User Stories

1. As a visitor, I want to understand that Gravy Scout is a career scout I text on Telegram, so that I do not look for a web chat box.
2. As a visitor, I want a single get-started action that opens the Telegram bot, so that I can start talking without creating a website account.
3. As a visitor, I want to message the bot with no prior website visit, so that a friend can share the bot username and I can start immediately.
4. As a new member, I want a bare `/start` to be a welcome, so that Telegram’s Start button is not an error.
5. As a new member, I want my first ordinary message (not only `/start`) to get a real reply, so that I am not told to sign in on the web.
6. As a new member, I want that first message to create my **member** and **channel identity** from my Telegram user ID, so that I do not prove who I am with a Login Widget.
7. As a new member, I want my Telegram username to be display metadata only, so that renaming myself does not create a second account or break the old one.
8. As a new member, I want a second message to continue the same **conversation**, so that I am not treated as a stranger again.
9. As a new member, I want Gravy Scout to ask for current role, location, and goals in Telegram, so that my **career profile** starts relevant without a website form.
10. As a new member, I want to paste a résumé or describe my history in Telegram, so that I do not retype a career into a web wizard.
11. As a new member, I want to state hard constraints in Telegram (location, authorization, compensation, remote), so that impossible **opportunities** are excluded.
12. As a new member, I want inferred **preferences** labelled as inferred when the agent says them back, so that I can correct them.
13. As a new member, I want explicit choices to override inferred **preferences**, so that what I said wins.
14. As a new member, I want the bot to send my unique **inbound address** once my **career profile** is usable, so that I can forward LinkedIn/Seek/Indeed alerts without a dashboard.
15. As a new member, I want forwarding instructions in the same Telegram message as the **inbound address**, so that I know what to do next.
16. As a new member, I want to ask “what’s my alert email?” later and get the same **inbound address**, so that I do not hunt through a website.
17. As a new member, I want to revoke and rotate that **inbound address** in Telegram, so that a leaked address stops ingesting.
18. As a member, I want job-alert mail to that address to become **source items**, so that discovery has something to chew.
19. As a member, I want duplicate alerts collapsed, so that the same listing is not noise.
20. As a member, I want advertised, rumored, and inferred **candidate roles** distinguished, so that confidence is not overstated.
21. As a member, I want every material claim cited, so that I can judge the **opportunity**.
22. As a member, I want **opportunities** explained in Telegram with fit, risk, evidence, and a next step, so that I can act in the thread.
23. As a member, I want to save, dismiss, pursue, or mark an **opportunity** not interesting in Telegram, so that my shortlist lives with the scout.
24. As a member, I want “I applied” to set **disposition** `pursuing`, so that applied jobs are tracked without a separate application object.
25. As a member, I want a concise **digest** in Telegram when **opportunities** materially change, so that I am not padded daily.
26. As a member, I want no **digest** when nothing material changed, so that silence means nothing happened.
27. As a member, I want **digests** to appear in the same **conversation** as my chats, so that history is one timeline.
28. As a member, I want quiet hours respected for proactive **digests**, so that the bot does not wake me.
29. As a member, I want to say “text me again” or “stop proactive updates” in Telegram, so that consent is obvious.
30. As a member, I want Gravy Scout to draft outreach or an application as a **proposed action**, so that I can move faster.
31. As a member, I want to approve a **proposed action** with an explicit yes in Telegram, so that nothing goes out on my behalf by accident.
32. As a member, I want to refuse a **proposed action**, so that a draft does not execute.
33. As a member, I want each **proposed action** to need its own yes, so that “always apply to roles like this” cannot silently fire.
34. As a member, I want an unapproved **proposed action** to stay unsent even if the agent is jailbroken by a job-alert email, so that **source items** cannot authorize side effects.
35. As a member, I want Gravy Scout to remember my **career profile** across days in Telegram, so that I do not repeat myself.
36. As a member, I want a fresh **conversation** without deleting my **career profile** and **feedback events**, so that topic history and durable memory stay distinct.
37. As a member, I want another person’s Telegram account to be a different **member**, so that my profile is not mixed with theirs.
38. As a member, I want group chats ignored, so that a group add does not create a **member** or leak replies.
39. As a member, I want bot messages and empty channel noise ignored, so that the timeline stays mine.
40. As a member, I do not want a web chat composer, so that I am not pulled out of Telegram to “continue on the site.”
41. As a member, I do not want Telegram Login in order to talk, so that the Widget is not a gate to the agent.
42. As a visitor on the website, I want get-started to open Telegram rather than preview matches behind a verify step, so that the site matches the product.
43. As an operator, I want Telegram webhook signatures still verified, so that forged updates cannot create **members**.
44. As an operator, I want webhook retries to be idempotent, so that duplicate deliveries do not duplicate **messages** or **members**.
45. As an operator, I want a **discovery run** to remain deterministic and idempotent, so that retries do not double **digests**.
46. As an operator, I want **digest** delivery to Telegram recorded with the same idempotency as today’s skipped-digest path, so that I can see who was notified.
47. As an operator, I want Eve evals to assert that an unknown Telegram user ID becomes a **member** and receives a reply, so that the old “go to the website” refusal cannot regress.
48. As an operator, I want evals to assert that unapproved external actions still fail, so that bot-first identity does not weaken the approval line.
49. As a developer, I want existing identity, conversation, career profile, ingestion, and discovery modules reused, so that this is a product-shape change, not a second stack.
50. As a developer, I want the identity module to create **members** from a verified Telegram user ID on the talk **surface**, so that Login Widget code is not the birthplace of **members**.
51. As a future dashboard user, I want this spec to leave room for Telegram Login as a dashboard lock only, so that `/app` can return later without becoming a talk **surface**.
52. As a future dashboard user, I do not want that dashboard to show the **conversation** transcript, so that Telegram remains the history.
53. As a member, I want to correct a wrong **career profile** fact in Telegram, so that inferred drift does not stick.
54. As a member, I want to ask “what are you working on for me?” and hear current **opportunities** and `pursuing` items, so that the dashboard is not required to see my context.
55. As a member, I want links in Telegram to be canonical and not tracking-heavy when the agent cites a listing, so that I can open the real job.
56. As a member, I want the agent to ask a focused question when uncertainty would change ranking, so that setup stays conversational rather than a long form.
57. As a member, I want to disconnect Telegram and stop being reachable, so that revocation is immediate.
58. As a member, I want disconnecting to stop **digests** and **proposed actions**, so that a revoked **channel identity** cannot be used.
59. As an operator, I want two Telegram user IDs to never share a **member**, so that identity stays 1:1 in this slice.
60. As a member, I want attachments in Telegram (a résumé photo or file) to be acknowledged, so that I know whether the agent can use them.

## Implementation Decisions

- Gravy Scout remains opportunity intelligence. Poke is the interaction model only: the agent is a contact; the website is not the workspace.
- The talk **surface** is Telegram only. Do not add web as a talk **surface**. Do not keep a member-facing chat composer.
- A first private Telegram message (including `/start` with no payload) upserts a **member** from the Telegram user ID, binds **channel identity**, stores messaging destination and consent, opens the canonical **conversation**, and runs an agent turn. Username-only linking stays rejected; the user ID is the identity.
- Identity creation on the talk **surface** lives in the identity module. Do not mint **members** in the Telegram adapter ad hoc. Login Widget and Clerk must not be required to talk. ADR-0005 supersedes ADR-0004 for member creation.
- Existing website-first link tokens may remain for reconnect and for a future dashboard lock. They are not the cold-start path. Bare `/start` is welcome, not “generate a link from the web app.”
- The conversation module stays. Telegram inbound and assistant replies still go through the conversation bridge with idempotency keys derived from Telegram message IDs. Eve **agent sessions** stay surface-specific runtime.
- The web app in this slice is public marketing plus get-started that opens the bot. Do not build the non-agentic dashboard. Do not show the **conversation** on the web. `/app` workspace chat is out of the member journey (redirect or retire the composer); a later dashboard is Telegram Login–locked per ADR-0006.
- Career profile remains Postgres-authoritative. Onboarding questions and résumé paste run through the existing career profile module via tools. There is no required website career form.
- After the **career profile** is usable, the agent issues an **inbound address** via the existing inbound-alias/connection module and sends the address plus forwarding instructions on Telegram (ADR-0007). Repeat asks return the active address. Revoke/rotate uses the same connection module.
- Job-alert ingestion, quarantine, and discovery orchestration stay as they are. This spec does not add new source adapters.
- **Digest** delivery must send on Telegram when the **channel identity** is active and quiet hours allow it, and must persist on the canonical **conversation**. A no-material-change **discovery run** still records a skipped delivery and must not message the member. Deterministic code decides whether a **digest** is due; the model does not.
- **Disposition** values stay `saved`, `dismissed`, `pursuing`, `not_interested`. “I applied” maps to `pursuing`. No application table.
- **Proposed action** is a first-class durable record: draft, wait for a per-event yes or no in Telegram, then execute or discard. Outreach and apply cannot run without that yes. Standing approvals are forbidden. Prompt-injection from a **source item** cannot count as approval.
- Group chats, channels, and other bots are ignored. One Telegram user ID maps to at most one **member** in this slice.
- WhatsApp is not a **surface**. Capture/Playwright scraping is not a member journey.
- Prefer deepening existing modules (identity, conversation, career profile, ingestion/connection, discovery, opportunities) over new wrappers. The Telegram channel is an adapter at the talk **surface** seam, not a second product database.

## Testing Decisions

A good test observes member-visible behavior at the talk **surface**. It does not assert prompt text, Widget markup, or which helper function allocated the **member**.

**Primary seam (one):** a verified Telegram private update. Through that seam, tests must see: **member** + **channel identity** created or resolved, **conversation** **message** appended, agent reply sent, later turns able to write **career profile**, issue **inbound address**, set **disposition**, and refuse an unapproved **proposed action**. Do not add a second public seam for “create member” or “issue inbound address” if the bot already exposes them.

**Reuse, do not replace:** identity tests (Telegram user ID, not username), conversation idempotency tests, inbound ingestion tests, discovery no-op **digest** tests, career profile precedence tests, Eve eval hard gates for citations and unapproved external actions.

**Add or extend:**

- Cold start: unknown Telegram user ID, no web session, `/start` without token → **member** exists, welcome reply, no “sign in on the web” refusal.
- Cold start: first non-command text from an unknown user ID → same as above.
- Repeat message from the same user ID → same **member**, second **conversation** row, no second **member**.
- Two user IDs → two **members**.
- Username change → same **member**.
- Group chat → no **member**, no reply.
- Webhook retry with the same Telegram message id → one **message**.
- After a usable **career profile**, the member can obtain exactly one active **inbound address** via Telegram; mail to it still ingest as today.
- Material **discovery run** → Telegram **digest** + **conversation** row; empty run → skipped delivery, no Telegram send.
- **Proposed action** without a yes → no external side effect; with an explicit yes → may execute; a second different action needs a new yes.
- Get-started page offers open-the-bot and does not require Login Widget to talk.
- Eve eval: unknown Telegram identity is onboarded; “email the hiring manager” without yes is refused; **source item** text cannot approve a **proposed action**.

Prior art: Telegram link/identity smokes, inbound smokes, discovery smokes, conversation smokes, career profile smokes, Eve eval suite (greeting, injection, citations, preferences, noop digest, unapproved actions).

## Out of Scope

- Building the non-agentic web dashboard (Today / Opportunities / Profile).
- Showing the **conversation** on the web, including read-only transcript.
- Telegram Login as a prerequisite to talk (it remains a possible later dashboard lock only).
- Clerk as a prerequisite to talk.
- Standing approvals or auto-apply rules.
- An **application** domain object or application-submission automation beyond a per-event **proposed action**.
- Web chat, WhatsApp, group Telegram chats, multiple Telegram identities per **member**.
- Mailbox OAuth, LinkedIn scraping, capture-sync as a member journey.
- New source adapters (careers pages, X, filings) beyond existing inbound email plus discovery research.
- Account export/deletion (still a later v1 gap).
- Native mobile apps.
- Rewriting Neon, Eve, or the discovery orchestrator from scratch.

## Further Notes

- This spec does not delete Eve web HTTP for local TUI or operator use; it removes web as a member talk **surface**.
- Existing Login Widget and deep-link login-challenge code can stay dormant for a future dashboard; cold start must not depend on them.
- `docs/specs/gravy-scout-v1.md` still describes opportunity intelligence; it is wrong where it treats Clerk as primary auth and web as a synchronized chat **surface**. Prefer this spec plus ADR-0005, ADR-0006, and ADR-0007 for those topics.
- Tracer bullets: GS-011 cold-start, GS-012 get-started, GS-013 inbound address in Telegram, GS-014 **digests**, GS-015 **proposed action** yes. Do not implement GS-010 as one slice.
