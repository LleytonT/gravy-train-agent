/**
 * In-memory tool execute paths used when GRAVY_SCOUT_EVAL_FIXTURE=1.
 */

import type { SessionContext } from "eve/context";

import { requireMemberCaller } from "../identity.js";
import {
  createFixtureOpportunity,
  fixtureModelContextMarkdown,
  fixtureRoleRecommendations,
  getFixtureCompany,
  getFixtureSignals,
  getFixtureState,
  listFixtureOpportunities,
  patchFixtureIdentity,
  readFixturePreferences,
  setFixturePreference,
} from "./store.js";

function preferencesObject(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of readFixturePreferences()) {
    out[row.key] = row.value;
  }
  return out;
}

export function fixtureUpdateUserProfile(
  input: {
    action: string;
    text?: string;
    preferenceKey?: string;
    preferenceValue?: string | boolean | string[];
    currentTitle?: string;
    currentCompany?: string;
    location?: string;
    summary?: string;
    interests?: string[];
  },
  ctx: SessionContext,
) {
  const { memberId } = requireMemberCaller(ctx);
  const state = getFixtureState();

  if (input.action === "read") {
    return {
      memberId,
      identity: state.identity,
      preferences: preferencesObject(),
      preferenceRows: readFixturePreferences(),
      document: { interests: [], notes: state.notes.join("\n") },
      content: fixtureModelContextMarkdown(),
    };
  }

  if (input.action === "set_preference") {
    if (!input.preferenceKey || input.preferenceValue === undefined) {
      return { error: "preferenceKey and preferenceValue required" };
    }
    setFixturePreference(input.preferenceKey, input.preferenceValue);
    return {
      saved: true,
      preferences: preferencesObject(),
      content: fixtureModelContextMarkdown(),
    };
  }

  if (input.action === "patch_profile") {
    patchFixtureIdentity({
      currentTitle: input.currentTitle,
      currentCompany: input.currentCompany,
      location: input.location,
      interests: input.interests,
    });
    return {
      saved: true,
      identity: state.identity,
      content: fixtureModelContextMarkdown(),
    };
  }

  if (input.action === "append" || input.action === "set_content") {
    if (input.text) {
      setFixturePreference("notes", input.text);
    }
    return {
      saved: true,
      content: fixtureModelContextMarkdown(),
    };
  }

  return { error: "unknown action" };
}

export function fixtureGetCompanyDossier(input: { company: string }) {
  const company = getFixtureCompany(input.company);
  if (!company) {
    return { found: false, company: input.company };
  }
  const signals = getFixtureSignals(company.id).map((signal) => ({
    id: signal.id,
    summary: signal.summary,
    sourceUrl: signal.sourceUrl,
    sourceExcerpt: signal.sourceExcerpt,
    observedAt: signal.observedAt,
    companyId: company.id,
  }));
  return {
    found: true,
    company,
    signals,
    opportunities: listFixtureOpportunities().filter(
      (o) => o.companyId === company.id,
    ),
  };
}

export function fixtureListOpportunities(input: { limit?: number }) {
  const opportunities = listFixtureOpportunities(input.limit ?? 20);
  return {
    count: opportunities.length,
    opportunities,
    memberId: getFixtureState().memberId,
  };
}

export function fixtureCreateOpportunity(
  input: {
    company: string;
    headline: string;
    score: number;
  },
  ctx: SessionContext,
) {
  requireMemberCaller(ctx);
  return createFixtureOpportunity(input);
}

export function fixtureRecommendRoles(
  _input: {
    limit?: number;
    includeOutreach?: boolean;
    company?: string;
  },
  ctx: SessionContext,
) {
  requireMemberCaller(ctx);
  return fixtureRoleRecommendations();
}

export function fixtureScoreCompany(
  input: { company: string },
  ctx: SessionContext,
) {
  requireMemberCaller(ctx);
  const company = getFixtureCompany(input.company);
  if (!company) {
    return { found: false, company: input.company };
  }
  const signals = getFixtureSignals(company.id);
  return {
    found: true,
    company: {
      id: company.id,
      name: company.name,
      tier: company.watchlistTier,
    },
    score: signals.length > 0 ? 7.5 : 2,
    rationale: signals[0]?.summary ?? "No cited signals",
    citations: signals.map((s) => s.sourceUrl),
  };
}
