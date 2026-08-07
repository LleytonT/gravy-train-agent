# Agent skill selection

## Installed for this repository

The following project-local skills from `mattpocock/skills` are committed under `.agents/skills/`:

- `setup-matt-pocock-skills` — establishes tracker and domain-document conventions.
- `domain-modeling` — maintains canonical domain language and decision records.
- `codebase-design` — designs deep modules and stable test seams.
- `improve-codebase-architecture` — identifies architectural deepening opportunities.
- `to-spec` — turns an established conversation into a product specification.
- `to-tickets` — decomposes a specification into dependency-aware tracer bullets.
- `handoff` — creates a compact continuation document for a fresh agent.
- `clerk-setup`, `clerk-nextjs-patterns`, `clerk-testing`, `clerk-backend-api`, `clerk-webhooks`, `clerk-orgs` — Clerk Marketplace guidance used for GS-002.

Use `to-spec` only after reading `CONTEXT.md` and current ADRs. Use `to-tickets` only when the requested capability is not already represented under `docs/tickets/`.

## Built-in workspace skills to use

- `eve` for any Eve agent, tool, channel, schedule, subagent, or eval work. Read the installed Eve docs before code.
- `shadcn` for UI primitives and product composition.
- `nextjs` for App Router and server/client boundaries.
- `vercel-storage` before provisioning or changing the production data layer.
- `auth` before implementing member authentication.
- `vercel-connect` for managed third-party OAuth in Eve connections.
- `marketplace` before selecting or provisioning inbound email, search, observability, or other external capabilities.
- `verification` whenever a development server is started or a full product path must be demonstrated.

## Skills discovered with `skills find`

Useful candidates, not installed yet:

- `wshobson/agents@evaluation-methodology` — useful while designing the opportunity-quality rubric.
- `wshobson/agents@llm-evaluation` — useful when GS-009 adds fuzzy quality scoring.
- `nicepkg/ai-workflow@resource-scout` — useful for future skill and MCP discovery.
- `nicepkg/ai-workflow@legacy-to-ai-ready` — potentially useful after the target module seams replace prototype state.

Do not install a community skill merely because it appears in search results. Review its instructions and security assessment, then add it only to the ticket that needs it.

## Missing requested capability

No Mobbin MCP server is available in the current environment. GS-008 treats Mobbin connection and recorded source references as a prerequisite for claiming Mobbin-informed UI decisions.
