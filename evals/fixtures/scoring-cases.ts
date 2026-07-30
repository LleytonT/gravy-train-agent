import type { ScoreCompanyPrefs, ScoringSignal } from "../../agent/lib/scoring.js";
import type { PingTier } from "../../agent/lib/scoring.js";

export type ScoringCase = {
  id: string;
  signals: ScoringSignal[];
  prefs?: ScoreCompanyPrefs;
  expect: {
    pingTier?: PingTier;
    minScore?: number;
    maxScore?: number;
    minTiming?: number;
    maxTiming?: number;
    minTerritory?: number;
    minTalent?: number;
    minNegativeDrag?: number;
    rationaleIncludes?: string[];
  };
};

const now = Date.now();
export const daysAgo = (n: number) =>
  new Date(now - n * 86400000).toISOString();

/** Deterministic scoring fixtures — expand whenever the rubric changes. */
export const SCORING_CASES: ScoringCase[] = [
  {
    id: "compound-immediate",
    signals: [
      {
        type: "exec_tour",
        direction: "positive",
        strength: 4,
        summary: "CEO in Sydney",
        observedAt: daysAgo(2),
      },
      {
        type: "sydney_infra",
        direction: "positive",
        strength: 4,
        summary: "Sydney region chatter",
        observedAt: daysAgo(5),
      },
      {
        type: "apac_sales_leadership_hire",
        direction: "positive",
        strength: 5,
        summary: "Hired VP APAC Sales",
        observedAt: daysAgo(1),
      },
    ],
    expect: {
      pingTier: "immediate",
      minScore: 5,
      minTiming: 4,
    },
  },
  {
    id: "ignore-tier-suppresses-ping",
    signals: [
      {
        type: "funding_round",
        direction: "positive",
        strength: 3,
        summary: "Raised seed",
        observedAt: daysAgo(1),
      },
    ],
    prefs: { watchlistTier: "ignore" },
    expect: { pingTier: "none" },
  },
  {
    id: "immediate-first-apac-gtm-job",
    signals: [
      {
        type: "first_apac_gtm_job",
        direction: "positive",
        strength: 5,
        summary: "First APAC AE role posted",
        observedAt: daysAgo(1),
      },
    ],
    expect: {
      // Concurrent "act fast" type: forces immediate ping even when Timing
      // dimension stays low (not in LEADING_SIGNAL_TYPES).
      pingTier: "immediate",
    },
  },
  {
    id: "immediate-apac-sales-leadership",
    signals: [
      {
        type: "apac_sales_leadership_hire",
        direction: "positive",
        strength: 5,
        summary: "Hired VP APAC Sales",
        observedAt: daysAgo(1),
      },
    ],
    expect: {
      pingTier: "immediate",
      minTiming: 0.5,
      minTalent: 0.25,
      minScore: 1,
    },
  },
  {
    id: "digest-adjacent-se",
    signals: [
      {
        type: "adjacent_se_csm",
        direction: "positive",
        strength: 5,
        summary: "First Sydney SE hire",
        observedAt: daysAgo(2),
      },
    ],
    expect: {
      pingTier: "digest",
      minTalent: 0.25,
      minScore: 0.5,
    },
  },
  {
    id: "negatives-only-no-ping",
    signals: [
      {
        type: "apac_retreat",
        direction: "negative",
        strength: 5,
        summary: "Shutting Sydney office",
        observedAt: daysAgo(1),
      },
    ],
    expect: {
      pingTier: "none",
      maxScore: 0,
      minNegativeDrag: 0.5,
    },
  },
  {
    id: "ignore-category-suppresses-score",
    signals: [
      {
        type: "exec_tour",
        direction: "positive",
        strength: 4,
        summary: "CEO touring Sydney",
        observedAt: daysAgo(1),
      },
    ],
    prefs: {
      ignoreCategories: ["recruiting"],
      companyCategory: "recruiting",
      companyName: "Acme Recruiting",
    },
    expect: {
      pingTier: "none",
      maxScore: 0,
      rationaleIncludes: ["ignore list"],
    },
  },
  {
    id: "hyperscaler-preference-bump",
    signals: [
      {
        type: "talent_flow_strong_org",
        direction: "positive",
        strength: 4,
        summary: "Strong org hire into ANZ",
        observedAt: daysAgo(2),
      },
      {
        type: "expansion_signal",
        direction: "positive",
        strength: 3,
        summary: "APAC expansion chatter",
        observedAt: daysAgo(3),
      },
    ],
    prefs: {
      preferHyperscalers: true,
      companyName: "Google Cloud",
    },
    expect: {
      rationaleIncludes: ["Hyperscaler"],
      minScore: 1,
    },
  },
  {
    id: "seed-stage-penalty",
    signals: [
      {
        type: "funding_round",
        direction: "positive",
        strength: 4,
        summary: "Raised seed round with GTM expansion language",
        observedAt: daysAgo(1),
      },
      {
        type: "exec_tour",
        direction: "positive",
        strength: 3,
        summary: "Founder in Sydney for seed customers",
        observedAt: daysAgo(2),
      },
    ],
    prefs: {
      avoidSeedStage: true,
      companyName: "TinySeed Labs",
    },
    expect: {
      rationaleIncludes: ["Seed-stage"],
    },
  },
  {
    id: "stale-signals-decay",
    signals: [
      {
        type: "sydney_infra",
        direction: "positive",
        strength: 5,
        summary: "Old Sydney infra mention",
        observedAt: daysAgo(200),
      },
    ],
    expect: {
      // Decayed strength should contribute less than a fresh equivalent.
      maxScore: 2.5,
    },
  },
  {
    id: "weak-ambient-none-or-low",
    signals: [
      {
        type: "funding_round",
        direction: "positive",
        strength: 1,
        summary: "Minor funding mention",
        observedAt: daysAgo(40),
      },
    ],
    expect: {
      maxScore: 2,
    },
  },
];
