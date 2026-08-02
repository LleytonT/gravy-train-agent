/**
 * Deterministic job-alert analyst (Eve subagent job_alert_analyst mirrors this).
 * Extracts structured role fields from an ingested job_listing source item.
 */

import type { CandidateRoleKind } from "../types.js";

export type JobAlertExtraction = {
  title: string;
  companyName: string;
  location: string | null;
  canonicalUrl: string | null;
  kind: CandidateRoleKind;
  board: string | null;
  confidence: number;
  excerpt: string;
  /** Annual compensation when present on the listing payload (for hard gates). */
  compensation?: number | null;
  compensationCurrency?: string | null;
};

export function extractJobAlertFromSourceItem(item: {
  title: string | null;
  excerpt: string;
  canonicalUrl: string | null;
  payload: Record<string, unknown>;
}): JobAlertExtraction | null {
  const title =
    (typeof item.title === "string" && item.title.trim()) ||
    (typeof item.payload.title === "string" && item.payload.title.trim()) ||
    null;
  const companyName =
    (typeof item.payload.company === "string" && item.payload.company.trim()) ||
    inferCompanyFromExcerpt(item.excerpt) ||
    null;
  if (!title || !companyName) return null;

  const location =
    (typeof item.payload.location === "string" &&
      item.payload.location.trim()) ||
    null;
  const board =
    (typeof item.payload.board === "string" && item.payload.board.trim()) ||
    null;

  const compensation = readCompensation(item.payload);

  return {
    title,
    companyName,
    location,
    canonicalUrl: item.canonicalUrl,
    kind: "advertised",
    board,
    confidence: item.canonicalUrl ? 0.9 : 0.7,
    excerpt: item.excerpt,
    compensation: compensation?.amount ?? null,
    compensationCurrency: compensation?.currency ?? null,
  };
}

function readCompensation(
  payload: Record<string, unknown>,
): { amount: number; currency: string | null } | null {
  const raw =
    payload.compensation ??
    payload.compensationMin ??
    payload.salary ??
    payload.salaryMin;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return {
      amount: raw,
      currency:
        typeof payload.compensationCurrency === "string"
          ? payload.compensationCurrency
          : typeof payload.currency === "string"
            ? payload.currency
            : null,
    };
  }
  if (typeof raw === "string") {
    const digits = raw.replace(/[^0-9.]/g, "");
    const amount = Number.parseFloat(digits);
    if (Number.isFinite(amount) && amount > 0) {
      return {
        amount,
        currency:
          typeof payload.compensationCurrency === "string"
            ? payload.compensationCurrency
            : null,
      };
    }
  }
  return null;
}

function inferCompanyFromExcerpt(excerpt: string): string | null {
  const at = excerpt.match(/\bat\s+([A-Z][\w.& ]{1,60})/i);
  if (at?.[1]) return at[1].trim();
  const dash = excerpt.match(/\s[—–-]\s+([A-Z][\w.& ]{1,60})/);
  if (dash?.[1]) return dash[1].trim();
  return null;
}
