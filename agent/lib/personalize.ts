/**
 * Personalized Gravy Train recommendations: role matches + outreach targets.
 */

import {
  detectRoleFamily,
  getRoleFamily,
  parseCareerIdentityFromProfile,
  titleAffinityScore,
  type CareerIdentity,
  type RoleFamilyId,
} from "./role-affinity.js";
import type { Company, Signal } from "./db/schema.js";
import type { ScoreCompanyResult } from "./scoring.js";

export const OUTREACH_KINDS = [
  "hiring_manager",
  "peer_in_seat",
  "adjacent",
] as const;
export type OutreachKind = (typeof OUTREACH_KINDS)[number];

export type OpenRoleInput = {
  companyId: string;
  companyName: string;
  title: string;
  location?: string | null;
  sourceUrl?: string | null;
  status?: "open" | "rumored" | "filled";
};

export type OutreachTargetInput = {
  companyId: string;
  companyName: string;
  name: string;
  title: string;
  kind: OutreachKind;
  linkedInUrl?: string | null;
  whyReachOut: string;
  relatedRoleTitle?: string | null;
};

export type RoleRecommendation = {
  companyId: string;
  companyName: string;
  companyTier: string;
  companyCategory: string | null;
  recommendedTitles: string[];
  roleFit: number;
  gravyScore: number;
  pingTier: ScoreCompanyResult["pingTier"];
  why: string[];
  geographyFit: boolean;
  matchedSignals: string[];
};

export type PersonalizedRecsResult = {
  identity: CareerIdentity;
  recommendations: RoleRecommendation[];
};

type RankedRecommendation = RoleRecommendation & { _rank: number };

export function buildRoleRecommendations(input: {
  profileMarkdown: string;
  companies: Company[];
  signalsByCompany: Map<string, Signal[]>;
  scoresByCompany: Map<string, ScoreCompanyResult>;
  openRoles?: OpenRoleInput[];
  identityOverride?: Partial<CareerIdentity>;
}): PersonalizedRecsResult {
  const identity: CareerIdentity = {
    ...parseCareerIdentityFromProfile(input.profileMarkdown),
    ...input.identityOverride,
  };

  if (identity.roleFamily === "unknown" && identity.currentTitle) {
    identity.roleFamily = detectRoleFamily(identity.currentTitle);
  }

  const family = getRoleFamily(identity.roleFamily);
  const targetTitles = family?.targetTitles ?? ["Account Executive"];
  const leadingTypes = new Set(family?.leadingSignalTypes ?? []);

  const openByCompany = new Map<string, OpenRoleInput[]>();
  for (const role of input.openRoles ?? []) {
    const list = openByCompany.get(role.companyId) ?? [];
    list.push(role);
    openByCompany.set(role.companyId, list);
  }

  const recommendations: RankedRecommendation[] = [];

  for (const company of input.companies) {
    if (company.watchlistTier === "ignore") {
      continue;
    }

    // Don't recommend the user's current employer as a jump target
    if (
      identity.currentCompany &&
      normalize(company.name) === normalize(identity.currentCompany)
    ) {
      continue;
    }

    const signals = input.signalsByCompany.get(company.id) ?? [];
    const score = input.scoresByCompany.get(company.id);
    const gravyScore = score?.score ?? 0;
    const openRoles = openByCompany.get(company.id) ?? [];

    const matchedSignals = signals
      .filter(
        (s) =>
          s.direction === "positive" &&
          leadingTypes.has(s.type.trim().toLowerCase().replace(/\s+/g, "_")),
      )
      .map((s) => s.summary);

    const titleCandidates = [
      ...openRoles.map((r) => r.title),
      ...inferTitlesFromSignals(signals, targetTitles),
      ...targetTitles,
    ];

    const uniqueTitles = dedupeTitles(titleCandidates);
    const scoredTitles = uniqueTitles
      .map((title) => ({
        title,
        fit: titleAffinityScore(title, identity.roleFamily),
      }))
      .filter((t) => t.fit >= 0.55)
      .sort((a, b) => b.fit - a.fit);

    if (scoredTitles.length === 0 && matchedSignals.length === 0) {
      if (gravyScore < 4 && company.watchlistTier !== "hot") {
        continue;
      }
    }

    const recommendedTitles =
      scoredTitles.length > 0
        ? scoredTitles.slice(0, 4).map((t) => t.title)
        : targetTitles.slice(0, 3);

    const roleFit =
      scoredTitles[0]?.fit ??
      (matchedSignals.length > 0
        ? 0.65
        : company.watchlistTier === "hot"
          ? 0.55
          : 0.4);

    const geographyFit = companyGeographyFits(company, signals, identity);
    const why: string[] = [];

    if (identity.currentTitle && identity.currentCompany) {
      why.push(
        `You are a ${identity.currentTitle} at ${identity.currentCompany} — mapping to ${family?.label ?? "GTM"} seats.`,
      );
    }

    if (recommendedTitles.length) {
      why.push(`Target titles: ${recommendedTitles.join(", ")}.`);
    }

    if (matchedSignals.length) {
      why.push(
        `Role-relevant signals: ${matchedSignals.slice(0, 2).join("; ")}`,
      );
    }

    if (score?.rationale?.length) {
      why.push(...score.rationale.slice(0, 2));
    }

    if (geographyFit) {
      why.push("Geography aligns with your APAC/ANZ footprint.");
    }

    const rank =
      gravyScore * (0.55 + roleFit * 0.35) +
      (geographyFit ? 1.2 : 0) +
      (company.watchlistTier === "hot" ? 0.8 : 0) +
      matchedSignals.length * 0.4;

    recommendations.push({
      companyId: company.id,
      companyName: company.name,
      companyTier: company.watchlistTier,
      companyCategory: company.category,
      recommendedTitles,
      roleFit: round2(roleFit),
      gravyScore: round2(gravyScore),
      pingTier: score?.pingTier ?? "none",
      why,
      geographyFit,
      matchedSignals: matchedSignals.slice(0, 5),
      _rank: rank,
    });
  }

  recommendations.sort((a, b) => b._rank - a._rank);

  return {
    identity,
    recommendations: recommendations.slice(0, 12).map(({ _rank: _, ...rec }) => rec),
  };
}

export function pickOutreachForRecommendation(input: {
  recommendation: RoleRecommendation;
  targets: OutreachTargetInput[];
}): OutreachTargetInput[] {
  const forCompany = input.targets.filter(
    (t) =>
      t.companyId === input.recommendation.companyId ||
      normalize(t.companyName) === normalize(input.recommendation.companyName),
  );

  const order: OutreachKind[] = [
    "hiring_manager",
    "peer_in_seat",
    "adjacent",
  ];

  return [...forCompany].sort((a, b) => {
    const ai = order.indexOf(a.kind);
    const bi = order.indexOf(b.kind);
    return ai - bi;
  });
}

export function suggestOutreachAngles(
  identity: CareerIdentity,
  recommendation: RoleRecommendation,
  target: OutreachTargetInput,
): string {
  const titles = recommendation.recommendedTitles.join("/");
  switch (target.kind) {
    case "hiring_manager":
      return `Ask ${target.name} (${target.title}) about ${titles} hiring plans in ${identity.location ?? "APAC"} — you bring ${identity.currentTitle ?? "GTM"} experience from ${identity.currentCompany ?? "a strong org"}.`;
    case "peer_in_seat":
      return `Coffee chat with ${target.name} who holds a ${target.title} seat — learn territory, ramp, and what “good” looks like before you apply.`;
    case "adjacent":
      return `Warm intro path via ${target.name} (${target.title}) — adjacent to ${titles}; ask who owns hiring and what the bar is.`;
    default:
      return target.whyReachOut;
  }
}

function inferTitlesFromSignals(
  signals: Signal[],
  fallbackTargets: string[],
): string[] {
  const titles: string[] = [];
  for (const signal of signals) {
    if (signal.direction !== "positive") {
      continue;
    }
    const text = `${signal.summary} ${signal.excerpt ?? ""}`.toLowerCase();
    for (const target of fallbackTargets) {
      if (text.includes(normalize(target))) {
        titles.push(target);
      }
    }
    if (
      /\bsolutions engineer\b|\bsales engineer\b|\bfield engineer\b|\bdeployment engineer\b/i.test(
        text,
      )
    ) {
      const match = text.match(
        /\b(solutions engineer|sales engineer|field engineer|deployment engineer|customer engineer)\b/i,
      );
      if (match?.[1]) {
        titles.push(titleCase(match[1]));
      }
    }
  }
  return titles;
}

function companyGeographyFits(
  company: Company,
  signals: Signal[],
  identity: CareerIdentity,
): boolean {
  if (identity.geographyHints.length === 0) {
    return false;
  }
  const blob = [
    company.name,
    company.category ?? "",
    ...signals.map((s) => `${s.summary} ${s.excerpt ?? ""} ${s.type}`),
  ]
    .join(" ")
    .toLowerCase();

  return identity.geographyHints.some((hint) => blob.includes(hint));
}

function dedupeTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const title of titles) {
    const key = normalize(title);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(title);
  }
  return out;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type { RoleFamilyId, CareerIdentity };
