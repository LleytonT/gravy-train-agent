/**
 * Fit analyst — deterministic hard constraints + evidence-backed rationale.
 * Eve subagent fit_analyst can refine wording; this module owns eligibility.
 */

import type { ProfileConstraints } from "../../career-profile.js";
import type { ScoreCompanyResult } from "../../scoring.js";

export type FitInput = {
  roleTitle: string;
  roleLocation: string | null;
  companyName: string;
  companyScore: ScoreCompanyResult;
  signalIds: string[];
  signalSummaries: string[];
  constraints: ProfileConstraints | undefined;
  targetTitles?: string[];
  /** Annual compensation when known on the candidate role / listing. */
  compensation?: number | null;
  compensationCurrency?: string | null;
};

export type FitResult =
  | {
      eligible: true;
      rationale: string;
      citedSignalIds: string[];
    }
  | {
      eligible: false;
      reason: string;
      rationale: string;
      citedSignalIds: string[];
    };

export function analyzeFit(input: FitInput): FitResult {
  const cited = [...new Set(input.signalIds)].slice(0, 8);
  const constraintHit = hardConstraintViolation({
    roleLocation: input.roleLocation,
    compensation: input.compensation,
    compensationCurrency: input.compensationCurrency,
    constraints: input.constraints,
  });
  if (constraintHit) {
    return {
      eligible: false,
      reason: constraintHit,
      rationale: [
        `Excluded despite company score ${input.companyScore.score.toFixed(1)}: ${constraintHit}.`,
        ...input.companyScore.rationale.slice(0, 3),
        cited.length
          ? `Evidence: signals ${cited.join(", ")}.`
          : "No cited signals.",
      ].join(" "),
      citedSignalIds: cited,
    };
  }

  const titleBoost =
    input.targetTitles?.some((target) =>
      normalize(input.roleTitle).includes(normalize(target)),
    ) ?? false;

  const rationale = [
    `${input.roleTitle} at ${input.companyName} (score ${input.companyScore.score.toFixed(1)}, tier ${input.companyScore.pingTier}).`,
    ...input.companyScore.rationale.slice(0, 4),
    titleBoost ? "Matches an explicit target title preference." : null,
    ...input.signalSummaries.slice(0, 3).map((summary, i) => {
      const id = cited[i];
      return id ? `[${id.slice(0, 8)}] ${summary}` : summary;
    }),
    cited.length
      ? `Cited evidence ids: ${cited.join(", ")}.`
      : "Cited evidence ids: none.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    eligible: true,
    rationale,
    citedSignalIds: cited,
  };
}

export function hardConstraintViolation(
  roleLocationOrInput:
    | string
    | null
    | {
        roleLocation: string | null;
        compensation?: number | null;
        compensationCurrency?: string | null;
        constraints: ProfileConstraints | undefined;
      },
  constraintsMaybe?: ProfileConstraints | undefined,
): string | null {
  // Back-compat: hardConstraintViolation(location, constraints)
  const input =
    typeof roleLocationOrInput === "object" &&
    roleLocationOrInput !== null &&
    "constraints" in roleLocationOrInput
      ? roleLocationOrInput
      : {
          roleLocation: roleLocationOrInput as string | null,
          compensation: null,
          compensationCurrency: null,
          constraints: constraintsMaybe,
        };

  const constraints = input.constraints;
  if (!constraints) return null;

  const locations = constraints.locations?.map(normalize).filter(Boolean) ?? [];
  const roleLocation = input.roleLocation;
  if (locations.length > 0 && roleLocation) {
    const role = normalize(roleLocation);
    const remoteRole = /\bremote\b/.test(role);
    const ok = locations.some((loc) => {
      if (loc === "remote") return remoteRole;
      return role.includes(loc) || loc.includes(role);
    });
    if (!ok && !remoteRole) {
      return `role location "${roleLocation}" outside hard locations [${constraints.locations!.join(", ")}]`;
    }
  }

  if (constraints.remotePreference === "remote" && roleLocation) {
    const role = normalize(roleLocation);
    if (!/\bremote\b/.test(role) && /\b(onsite|on-site|office)\b/.test(role)) {
      return "member requires remote; role appears onsite";
    }
  }

  if (constraints.remotePreference === "onsite" && roleLocation) {
    const role = normalize(roleLocation);
    if (/\bremote\b/.test(role) && !/\bhybrid\b/.test(role)) {
      return "member requires onsite; role appears remote-only";
    }
  }

  const min = constraints.compensationMin;
  if (
    typeof min === "number" &&
    Number.isFinite(min) &&
    typeof input.compensation === "number" &&
    Number.isFinite(input.compensation) &&
    input.compensation < min
  ) {
    const currency =
      constraints.compensationCurrency ??
      input.compensationCurrency ??
      "";
    return `listed compensation ${input.compensation}${currency ? ` ${currency}` : ""} below hard minimum ${min}${currency ? ` ${currency}` : ""}`;
  }

  return null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
