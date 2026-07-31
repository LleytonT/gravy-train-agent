---
description: Use when personalizing recommendations from the user's LinkedIn profile — role-family matching, gravy-train company seats, and who to reach out to.
---

# LinkedIn personalization

The Gravy Train Index scores **companies**. Personalization maps the **user's role** onto seats at those companies and names the right humans to contact.

## Flow

1. **Ingest profile** — `ingest_linkedin_profile` (from chat) or `pnpm capture:profile` (Playwright, read-only `/in/me/`).
2. **Detect role family** — Sales Engineer → `sales_engineer` (also Field / Deployment / Solutions / Customer Engineer).
3. **Recommend roles** — `recommend_roles` ranks watchlist companies by gravy score × role-fit × geography.
4. **Outreach** — `find_outreach_targets` returns hiring manager / peer-in-seat / adjacent for each company. Persist new people with `action: save`.

## Example

User: Sales Engineer at Vercel, Sydney/Australia.

Expect recommendations like Field Engineer / Deployment Engineer / Sales Engineer / Solutions Engineer at **Decagon, Sierra, Cursor, Fireworks** (and other hot gravy-train cos) — **not** their current employer.

For each company, prefer outreach order:

1. `hiring_manager` — who opens the seat
2. `peer_in_seat` — someone currently doing the job (coffee chat)
3. `adjacent` — nearby GTM (AE/CSM/partner) who can intro

## Tools

| Tool | When |
| --- | --- |
| `ingest_linkedin_profile` | User connects LinkedIn or describes title/company/location |
| `recommend_roles` | “What roles fit me?”, “Where should I go next?” |
| `find_outreach_targets` | “Who do I talk to at Cursor?” |
| `save_open_role` | New rumored/open seat spotted in feed or web |
| `score_company` | Still the Gravy Train Index; now role/geo-aware |

## Guardrails

- Capture is read-only — never message, connect, or edit LinkedIn.
- Don't invent outreach names; only use DB rows or verified `search_web` findings, then `find_outreach_targets` save.
- Exclude the user's current company from jump recommendations.
