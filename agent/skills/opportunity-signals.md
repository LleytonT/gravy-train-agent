---
description: Use when classifying feed items or deciding whether a post contains a GTM/APAC opportunity signal. Defines the signal taxonomy by lead time.
---

# Opportunity signal taxonomy

Frame every signal by **lead time**.

## Leading (3–9 months before a role is posted — highest value)

- Regional leadership hire (Head of / GM / VP APAC) — strongest single predictor → `apac_sales_leadership_hire` / `regional_leadership_hire`
- Infrastructure commitment (Sydney region launch, AU data residency, AUD pricing) → `sydney_infra`
- Compliance moves toward AU gov/banks (IRAP, ISO + AU residency) → `irap`
- Local entity/office signals → `local_entity` / `apac_office`
- Exec APAC tours ("great week meeting customers in Sydney", Sydney conference talks) → `exec_tour`
- Adjacent-function hires first (SE/CSM/partnerships in APAC before AEs) → `adjacent_se_csm`

## Concurrent (0–3 months — act fast)

- Talent flow — high performers from strong sales orgs (Vercel, Datadog, AWS, Stripe-calibre) joining, especially ≥2 within a quarter → `talent_flow_strong_org`
- Recruiter activity ("confidential — Series B AI infra, first Sydney hire") → `expansion_signal`
- The actual APAC job post → `first_apac_gtm_job`

## Company-strength (is the train worth boarding)

- Fresh funding with GTM-expansion language → `funding_round` / `series_b_plus`
- PLG-to-enterprise inflection (first AE hires anywhere — APAC typically follows US by 6–12 months) → `expansion_signal`
- Local commercial pull (AU logos in case studies, local dev-community adoption) → `au_logo`
- Rep sentiment (President's Club / attainment posts) — ambient company-strength

## Negative (suppress scores)

- Short-tenure rep departures
- Regional leader leaving within ~a year of hire (failed expansion) → `leadership_departure`
- Hiring freezes/layoffs → `layoffs`
- Announced APAC office that never converts to hires → `apac_retreat`

Negative signals still get stored. They suppress Gravy Train scores and can trigger a "train cooling" note if the company was previously pinged.

## Compound rule

Combinations across categories **multiply**, not add. Example: Sydney infra + APAC leader hired + known-good rep joined = maximum-priority ping with a suggested action.

When extracting, return: company name, signal type (snake_case from above), direction (`positive`|`negative`), strength 1–5, one-line summary.
