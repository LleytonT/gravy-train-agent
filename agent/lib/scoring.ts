import { daysSince, decayWeight } from "./db/repo.js";
import type { Signal, WatchlistTier } from "./db/schema.js";

export type PingTier = "immediate" | "digest" | "none";

export type ScoreCompanyPrefs = {
  preferHyperscalers?: boolean;
  avoidSeedStage?: boolean;
  ignoreCategories?: string[];
  watchlistTier?: WatchlistTier;
  companyCategory?: string | null;
  companyName?: string;
  /** User's detected role family — boosts companies with matching talent signals. */
  roleFamily?: string;
  /** Geography tokens from LinkedIn profile (e.g. australia, sydney). */
  geographyHints?: string[];
};

export type ScoreCompanyResult = {
  score: number;
  timing: number;
  territory: number;
  talent: number;
  negativeDrag: number;
  rationale: string[];
  pingTier: PingTier;
};

export type ScoringSignal = Pick<
  Signal,
  "type" | "direction" | "strength" | "summary" | "observedAt"
>;

/** Lead-time "leading" signals (3–9 months before a role posts). */
const LEADING_SIGNAL_TYPES = new Set([
  "apac_sales_leadership_hire",
  "regional_leadership_hire",
  "sydney_infra",
  "irap",
  "local_entity",
  "apac_office",
  "exec_tour",
  "adjacent_se_csm",
  "anz_expansion",
]);

/** Concurrent / act-fast signals. */
const CONCURRENT_SIGNAL_TYPES = new Set([
  "talent_flow_strong_org",
  "expansion_signal",
  "first_apac_gtm_job",
  "people_watchlist_job_change",
  "people_watchlist_move",
]);

/** Company-strength signals (still digest-worthy when strong). */
const COMPANY_STRENGTH_TYPES = new Set([
  "funding_round",
  "series_b_plus",
  "product_launch_apac",
  "au_logo",
]);

const IMMEDIATE_LEADING_TYPES = new Set([
  "apac_sales_leadership_hire",
  "regional_leadership_hire",
  "first_apac_gtm_job",
  "people_watchlist_job_change",
  "people_watchlist_move",
]);

const TERRITORY_SIGNAL_TYPES = new Set([
  "sydney_infra",
  "irap",
  "local_entity",
  "exec_tour",
  "au_logo",
  "apac_office",
  "anz_expansion",
]);

const TALENT_SIGNAL_TYPES = new Set([
  "regional_leadership_hire",
  "adjacent_se_csm",
  "talent_flow_strong_org",
  "people_watchlist_move",
  "apac_sales_leadership_hire",
  "people_watchlist_job_change",
]);
const HYPERSCALER_HINTS = [
  "aws",
  "amazon web services",
  "google cloud",
  "gcp",
  "microsoft",
  "azure",
  "oracle cloud",
  "salesforce",
  "snowflake",
  "databricks",
];

const SEED_STAGE_HINTS = ["seed", "pre-seed", "angel", "stealth"];

/** Role-family → signal types that imply a matching seat is warming. */
const ROLE_FAMILY_SIGNAL_BOOSTS: Record<string, string[]> = {
  sales_engineer: [
    "adjacent_se_csm",
    "first_apac_gtm_job",
    "talent_flow_strong_org",
    "expansion_signal",
  ],
  account_executive: [
    "apac_sales_leadership_hire",
    "regional_leadership_hire",
    "first_apac_gtm_job",
    "adjacent_se_csm",
  ],
  customer_success: ["adjacent_se_csm", "expansion_signal", "au_logo"],
  solutions_architect: [
    "adjacent_se_csm",
    "sydney_infra",
    "talent_flow_strong_org",
  ],
  partnerships: ["expansion_signal", "au_logo", "exec_tour"],
  gtm_leadership: [
    "apac_sales_leadership_hire",
    "regional_leadership_hire",
    "anz_expansion",
    "local_entity",
  ],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeSignalType(type: string): string {
  return type.trim().toLowerCase().replace(/\s+/g, "_");
}

function isPositive(signal: ScoringSignal): boolean {
  return signal.direction === "positive";
}

function weightedStrength(signal: ScoringSignal): number {
  return signal.strength * decayWeight(signal.observedAt);
}

function isLeadingSignal(signal: ScoringSignal): boolean {
  const type = normalizeSignalType(signal.type);
  return isPositive(signal) && LEADING_SIGNAL_TYPES.has(type);
}

function isImmediateLeadingSignal(signal: ScoringSignal): boolean {
  const type = normalizeSignalType(signal.type);
  return isPositive(signal) && IMMEDIATE_LEADING_TYPES.has(type);
}

function countLeadingWithinDays(
  positiveSignals: ScoringSignal[],
  days: number,
): number {
  return positiveSignals.filter((signal) => {
    const type = normalizeSignalType(signal.type);
    return (
      LEADING_SIGNAL_TYPES.has(type) && daysSince(signal.observedAt) <= days
    );
  }).length;
}

function scoreTiming(positiveSignals: ScoringSignal[]): {
  score: number;
  rationale: string[];
} {
  const rationale: string[] = [];
  const leading = positiveSignals.filter(isLeadingSignal);
  const leading30d = countLeadingWithinDays(positiveSignals, 30);

  if (leading30d >= 2) {
    rationale.push(
      `Compound timing: ${leading30d} leading signals within 30 days (+4).`,
    );
    return { score: 4, rationale };
  }

  let score = 0;

  for (const signal of leading) {
    const type = normalizeSignalType(signal.type);
    const weight = weightedStrength(signal);

    if (IMMEDIATE_LEADING_TYPES.has(type)) {
      score += clamp(weight * 0.9, 0.5, 2);
      rationale.push(`Leading signal: ${signal.summary}`);
    } else {
      score += clamp(weight * 0.5, 0.25, 1.25);
      rationale.push(`Supporting leading signal: ${signal.summary}`);
    }
  }

  const recentWindow = positiveSignals.filter(
    (signal) => daysSince(signal.observedAt) <= 14,
  );
  if (recentWindow.length >= 2 && score > 0) {
    score += 0.5;
    rationale.push("Concurrent activity bump: multiple signals in 14 days.");
  }

  return { score: clamp(score, 0, 4), rationale };
}

function scoreTerritory(positiveSignals: ScoringSignal[]): {
  score: number;
  rationale: string[];
} {
  const rationale: string[] = [];
  let score = 0;

  for (const signal of positiveSignals) {
    const type = normalizeSignalType(signal.type);
    if (!TERRITORY_SIGNAL_TYPES.has(type)) {
      continue;
    }

    const contribution = clamp(weightedStrength(signal) * 0.6, 0.25, 1);
    score += contribution;
    rationale.push(`Territory relevance (${type}): ${signal.summary}`);
  }

  return { score: clamp(score, 0, 3), rationale };
}

function scoreTalent(positiveSignals: ScoringSignal[]): {
  score: number;
  rationale: string[];
} {
  const rationale: string[] = [];
  let score = 0;

  for (const signal of positiveSignals) {
    const type = normalizeSignalType(signal.type);
    if (!TALENT_SIGNAL_TYPES.has(type)) {
      continue;
    }

    const contribution = clamp(weightedStrength(signal) * 0.65, 0.25, 1);
    score += contribution;
    rationale.push(`Talent signal (${type}): ${signal.summary}`);
  }

  return { score: clamp(score, 0, 3), rationale };
}

function scoreNegativeDrag(signals: ScoringSignal[]): {
  drag: number;
  rationale: string[];
} {
  const rationale: string[] = [];
  let drag = 0;

  for (const signal of signals) {
    if (signal.direction !== "negative") {
      continue;
    }

    const contribution = weightedStrength(signal) * 0.35;
    drag += contribution;
    rationale.push(`Negative drag (${signal.type}): ${signal.summary}`);
  }

  return { drag: clamp(drag, 0, 4), rationale };
}

function determinePingTier(input: {
  positiveSignals: ScoringSignal[];
  timing: number;
  territory: number;
  talent: number;
  watchlistTier?: WatchlistTier;
}): PingTier {
  if (input.watchlistTier === "ignore") {
    return "none";
  }

  const leading30d = countLeadingWithinDays(input.positiveSignals, 30);
  if (leading30d >= 2) {
    return "immediate";
  }

  const hasImmediateLeading = input.positiveSignals.some(isImmediateLeadingSignal);
  if (hasImmediateLeading) {
    return "immediate";
  }

  const hasDigestLeading = input.positiveSignals.some(
    (signal) =>
      isLeadingSignal(signal) ||
      (isPositive(signal) &&
        (CONCURRENT_SIGNAL_TYPES.has(normalizeSignalType(signal.type)) ||
          COMPANY_STRENGTH_TYPES.has(normalizeSignalType(signal.type)))),
  );
  if (hasDigestLeading && input.timing + input.territory + input.talent >= 2) {
    return "digest";
  }

  if (input.timing + input.territory + input.talent < 1.5) {
    return "none";
  }

  return "digest";
}

function applyPreferenceAdjustments(
  base: ScoreCompanyResult,
  prefs?: ScoreCompanyPrefs,
  inputSignals?: ScoringSignal[],
): ScoreCompanyResult {
  if (!prefs) {
    return base;
  }

  const rationale = [...base.rationale];
  let score = base.score;
  let talent = base.talent;
  let territory = base.territory;

  if (
    prefs.ignoreCategories?.length &&
    prefs.companyCategory &&
    prefs.ignoreCategories.some(
      (category) =>
        category.toLowerCase() === prefs.companyCategory!.toLowerCase(),
    )
  ) {
    score = 0;
    rationale.push(
      `Category "${prefs.companyCategory}" is on ignore list; score suppressed.`,
    );
    return { ...base, score, rationale, pingTier: "none" };
  }

  if (prefs.avoidSeedStage) {
    const seedHit = [...base.rationale, prefs.companyName ?? ""]
      .join(" ")
      .toLowerCase();
    if (SEED_STAGE_HINTS.some((hint) => seedHit.includes(hint))) {
      score = clamp(score - 1.5, 0, 10);
      rationale.push("Seed-stage preference penalty applied.");
    }
  }

  if (prefs.preferHyperscalers && prefs.companyName) {
    const name = prefs.companyName.toLowerCase();
    if (HYPERSCALER_HINTS.some((hint) => name.includes(hint))) {
      score = clamp(score + 0.5, 0, 10);
      rationale.push("Hyperscaler preference bump applied.");
    }
  }

  if (prefs.roleFamily && inputSignals) {
    const boostTypes = new Set(
      ROLE_FAMILY_SIGNAL_BOOSTS[prefs.roleFamily] ?? [],
    );
    if (boostTypes.size > 0) {
      const hits = inputSignals.filter(
        (signal) =>
          signal.direction === "positive" &&
          boostTypes.has(normalizeSignalType(signal.type)),
      );
      if (hits.length > 0) {
        const bump = clamp(hits.length * 0.35, 0.35, 1.25);
        score = clamp(score + bump, 0, 10);
        talent = clamp(talent + bump * 0.5, 0, 3);
        rationale.push(
          `Role-fit bump (+${bump.toFixed(2)}) for ${prefs.roleFamily}: ${hits.length} matching talent/GTM signal(s).`,
        );
      }
    }
  }

  if (prefs.geographyHints?.length && inputSignals) {
    const blob = inputSignals
      .map((s) => `${s.type} ${s.summary}`)
      .join(" ")
      .toLowerCase();
    const geoHit = prefs.geographyHints.some((hint) =>
      blob.includes(hint.toLowerCase()),
    );
    if (geoHit) {
      score = clamp(score + 0.4, 0, 10);
      territory = clamp(territory + 0.25, 0, 3);
      rationale.push("Geography-fit bump: signals match your LinkedIn location.");
    }
  }

  return { ...base, score, talent, territory, rationale };
}

export function scoreCompany(
  inputSignals: ScoringSignal[],
  prefs?: ScoreCompanyPrefs,
): ScoreCompanyResult {
  const positiveSignals = inputSignals.filter(isPositive);
  const timingResult = scoreTiming(positiveSignals);
  const territoryResult = scoreTerritory(positiveSignals);
  const talentResult = scoreTalent(positiveSignals);
  const negativeResult = scoreNegativeDrag(inputSignals);

  const rawSubtotal = timingResult.score + territoryResult.score + talentResult.score;
  const clampedSubtotal = clamp(rawSubtotal, 0, 10);
  const score = clamp(clampedSubtotal - negativeResult.drag, 0, 10);

  const rationale = [
    ...timingResult.rationale,
    ...territoryResult.rationale,
    ...talentResult.rationale,
    ...negativeResult.rationale,
  ];

  if (positiveSignals.length === 0 && negativeResult.drag > 0) {
    rationale.push("Negatives only; no positive GTM motion detected.");
  }

  if (rationale.length === 0) {
    rationale.push("No strong APAC GTM signals detected.");
  }

  const pingTier = determinePingTier({
    positiveSignals,
    timing: timingResult.score,
    territory: territoryResult.score,
    talent: talentResult.score,
    watchlistTier: prefs?.watchlistTier,
  });

  const base: ScoreCompanyResult = {
    score,
    timing: timingResult.score,
    territory: territoryResult.score,
    talent: talentResult.score,
    negativeDrag: negativeResult.drag,
    rationale,
    pingTier: score <= 0 && negativeResult.drag > 0 ? "none" : pingTier,
  };

  return applyPreferenceAdjustments(base, prefs, inputSignals);
}
