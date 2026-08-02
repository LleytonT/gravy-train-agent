# GS-008 — Shadcn product UI

Blocked by: GS-003, GS-004, and GS-007.

## Goal

Turn the prototype chat shell into a clear onboarding and daily opportunity workspace built from shadcn/ui primitives.

## Prerequisite

Connect the Mobbin MCP server and record the specific onboarding, inbox, opportunity-detail, and connected-account references used. Do not describe generic memory as Mobbin research.

## Scope

- Create a public product explanation and secure app shell.
- Build progressive onboarding for career snapshot, goals, constraints, alert address, and optional Telegram.
- Add Today, Opportunities, Conversation, and Profile & connections.
- Show evidence, freshness, confidence, fit, risk, next action, and disposition on opportunity details.
- Add responsive empty, loading, error, reconnect, and permission states.
- Use shadcn primitives instead of bespoke controls where an appropriate primitive exists.
- Preserve keyboard navigation, semantic labels, contrast, and mobile layouts.

## Acceptance checks

- A new member can reach first recommendations without LinkedIn scraping.
- A member can configure alerts and Telegram independently.
- Opportunity state changes are immediately reflected in list and detail views.
- Conversation recovery works after refresh and temporary disconnect.
- All primary flows are keyboard-usable and have accessible names.
- Automated checks pass and a browser video demonstrates the complete onboarding-to-opportunity flow.

## Not in scope

Native mobile apps, visualizing model chain-of-thought, or autonomous application flows.
