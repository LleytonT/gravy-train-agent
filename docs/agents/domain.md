# Domain documentation

Layout: single context.

- `CONTEXT.md` is the implementation-free glossary. Read it before specs, tickets, prompts, schemas, or UI copy.
- `docs/adr/` contains decisions that are costly to reverse, surprising without context, and based on a real trade-off.
- `docs/specs/` describes member-visible outcomes and cross-cutting implementation/testing decisions.
- `docs/tickets/` contains executable slices and dependency edges.

## Editing rules

- Add or sharpen a glossary term when the product meaning changes.
- Do not put file paths, framework choices, or implementation plans in `CONTEXT.md`.
- Do not create an ADR for routine or easily reversible choices.
- If code contradicts the target docs, state whether the ticket migrates the code or intentionally revises the decision.
- Use canonical terms from `CONTEXT.md`; do not introduce synonyms casually.
