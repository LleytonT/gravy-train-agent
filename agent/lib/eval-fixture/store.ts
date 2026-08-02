/**
 * In-memory product state for the eval fixture agent.
 * Seeded with one cited company dossier; opportunities start empty.
 */

import { FIXTURE_MEMBER_ID } from "./mode.js";

export type FixtureSignal = {
  id: string;
  summary: string;
  sourceUrl: string;
  sourceExcerpt: string;
  observedAt: string;
};

export type FixtureCompany = {
  id: string;
  name: string;
  watchlistTier: "core" | "watch" | "ignore";
  category: string;
};

export type FixtureOpportunity = {
  id: string;
  companyId: string;
  companyName: string;
  headline: string;
  score: number;
  status: string;
};

export type FixturePreference = {
  key: string;
  value: unknown;
  provenance: "explicit" | "inferred";
};

type FixtureState = {
  memberId: string;
  identity: {
    currentTitle: string;
    currentCompany: string;
    location: string;
    roleFamily: string;
  };
  preferences: Map<string, FixturePreference>;
  notes: string[];
  companies: Map<string, FixtureCompany>;
  signalsByCompany: Map<string, FixtureSignal[]>;
  opportunities: FixtureOpportunity[];
  createdOpportunityCount: number;
};

function createInitialState(): FixtureState {
  const fireworks: FixtureCompany = {
    id: "fireworks",
    name: "Fireworks",
    watchlistTier: "core",
    category: "inference",
  };

  return {
    memberId: FIXTURE_MEMBER_ID,
    identity: {
      currentTitle: "Sales Engineer",
      currentCompany: "Vercel",
      location: "Sydney, AU",
      roleFamily: "sales_engineer",
    },
    preferences: new Map(),
    notes: [],
    companies: new Map([["fireworks", fireworks], ["Fireworks", fireworks]]),
    signalsByCompany: new Map([
      [
        "fireworks",
        [
          {
            id: "sig_fw_apac_hire",
            summary: "Fireworks posted an APAC Solutions Engineer role",
            sourceUrl: "https://example.com/sources/fireworks-apac-se-2026",
            sourceExcerpt:
              "We're hiring a Solutions Engineer to support APAC customers from Sydney.",
            observedAt: "2026-07-15T00:00:00.000Z",
          },
        ],
      ],
    ]),
    opportunities: [],
    createdOpportunityCount: 0,
  };
}

let state: FixtureState = createInitialState();

export function resetFixtureStore(): void {
  state = createInitialState();
}

export function getFixtureState(): FixtureState {
  return state;
}

export function fixtureMemberId(): string {
  return state.memberId;
}

export function setFixturePreference(
  key: string,
  value: unknown,
): FixturePreference {
  const row: FixturePreference = {
    key,
    value,
    provenance: "explicit",
  };
  state.preferences.set(key, row);
  return row;
}

export function readFixturePreferences(): FixturePreference[] {
  return [...state.preferences.values()];
}

export function patchFixtureIdentity(
  patch: Partial<FixtureState["identity"]> & { interests?: string[] },
): void {
  state.identity = { ...state.identity, ...patch };
  if (patch.interests?.length) {
    state.notes.push(`interests: ${patch.interests.join(", ")}`);
  }
}

export function fixtureModelContextMarkdown(): string {
  const prefs = readFixturePreferences()
    .map((p) => `- ${p.key}: ${JSON.stringify(p.value)} (${p.provenance})`)
    .join("\n");
  return [
    `# Career Identity`,
    `- Title: ${state.identity.currentTitle}`,
    `- Company: ${state.identity.currentCompany}`,
    `- Location: ${state.identity.location}`,
    `- Role family: ${state.identity.roleFamily}`,
    ``,
    `# Preferences`,
    prefs || "- (none)",
    ``,
    `# Notes`,
    state.notes.length ? state.notes.map((n) => `- ${n}`).join("\n") : "- (none)",
  ].join("\n");
}

export function getFixtureCompany(nameOrId: string): FixtureCompany | null {
  const direct = state.companies.get(nameOrId);
  if (direct) return direct;
  const lowered = nameOrId.trim().toLowerCase();
  for (const company of state.companies.values()) {
    if (company.id === lowered || company.name.toLowerCase() === lowered) {
      return company;
    }
  }
  return null;
}

export function getFixtureSignals(companyId: string): FixtureSignal[] {
  return state.signalsByCompany.get(companyId) ?? [];
}

export function listFixtureOpportunities(limit = 20): FixtureOpportunity[] {
  return state.opportunities.slice(0, limit);
}

export function createFixtureOpportunity(input: {
  company: string;
  headline: string;
  score: number;
}):
  | { created: true; opportunity: FixtureOpportunity }
  | { created: false; error: string } {
  const company = getFixtureCompany(input.company);
  if (!company) {
    return { created: false, error: `Company not found: ${input.company}` };
  }
  const opportunity: FixtureOpportunity = {
    id: `opp_fixture_${state.createdOpportunityCount + 1}`,
    companyId: company.id,
    companyName: company.name,
    headline: input.headline,
    score: input.score,
    status: "new",
  };
  state.opportunities.unshift(opportunity);
  state.createdOpportunityCount += 1;
  return { created: true, opportunity };
}

export function fixtureRoleRecommendations() {
  return {
    memberId: state.memberId,
    identity: state.identity,
    count: 2,
    recommendations: [
      {
        companyName: "Fireworks",
        title: "Solutions Engineer, APAC",
        why: "Matches SE background and Sydney location",
        sourceUrl: "https://example.com/sources/fireworks-apac-se-2026",
        outreach: [
          {
            name: "Alex Chen",
            title: "Head of Solutions",
            kind: "hiring_manager",
          },
        ],
      },
      {
        companyName: "Decagon",
        title: "Deployment Engineer",
        why: "Adjacent field-engineering seat at an AI support platform",
        sourceUrl: "https://example.com/sources/decagon-deployment-2026",
        outreach: [],
      },
    ],
  };
}
