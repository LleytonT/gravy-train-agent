---
description: Use when scoring a company dossier or explaining a Gravy Train Index. Timing / Territory / Talent with time-decay and ping tiers.
---

# Gravy Train Index

Recompute after new signals land. Call `score_company` — it implements this rubric with decay.

## Dimensions

| Dimension | Range | What moves it |
| --- | --- | --- |
| Timing | 0–4 | Leading signals; compound (≥2 leading within 30 days) = 4; concurrent bumps act-fast |
| Territory | 0–3 | Sydney infra, IRAP, local entity, exec tours, AU logos, ANZ expansion |
| Talent | 0–3 | Regional leadership hire, adjacent SE/CSM, talent flow from strong orgs, people-watchlist moves |
| Negative drag | subtract | Negative strength × decay |

**Final score** = clamp(Timing + Territory + Talent − drag, 0, 10).

Signals lose weight after 90 days, near-zero after 270 (decay applied at read/score time).

## Ping tiers (must match instructions.md)

- **Immediate**: APAC/ANZ sales leadership hire; first APAC GTM job post; people-watchlist job change; compound (≥2 leading in 30d)
- **Digest**: single leading territory/talent/company-strength signals
- **None**: weak/ambient, negatives-only, `ignore` tier companies

Respect user-profile preferences (hyperscalers vs seed-stage, ignored categories). Never ping the same company twice within 48h.
