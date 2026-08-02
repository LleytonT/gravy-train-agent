# GS-009 — Eve evaluation suite

Blocked by: GS-003, GS-004, and GS-007.

## Goal

Make Gravy Scout's agent behavior measurable and safe to change across prompts, tools, and models.

## Scope

- Add Eve eval configuration and deterministic fixture cases.
- Cover onboarding questions, explicit preference updates, opportunity explanation, citations, tool selection, no-op digests, and unapproved external actions.
- Add multi-turn cases that switch topics and preserve profile facts.
- Add adversarial cases for source prompt injection and fabricated evidence.
- Use hard gates for deterministic safety/contract behavior and scored judgments only for genuinely fuzzy quality.
- Add an eval command to the normal quality-gate documentation and CI when available.

## Interface

Evals drive the same Eve HTTP surface as members. Assertions target replies, tool calls, persisted outcomes, and safety boundaries rather than internal prompt text.

## Acceptance checks

- The suite runs against a local fixture agent without provider credentials where deterministic behavior is sufficient.
- Preference-write and citation requirements are hard gates.
- A greeting does not trigger research or profile mutation.
- An empty discovery result produces no fabricated opportunity.
- Source content cannot instruct the agent to ignore system rules or perform an external action.
- The suite produces a non-zero exit code on a failed gate.

## Not in scope

Optimizing model prose to a single preferred style or replacing integration tests.
