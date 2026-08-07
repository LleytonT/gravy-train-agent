/**
 * Company researcher with explicit web-search budget.
 * Live search is optional; deterministic path works offline for tests.
 *
 * Secondary candidate kinds (rumored / inferred) are derived from research
 * text so discovery labels more than advertised job-alert roles.
 */

import type { CandidateRoleKind, LimitTracker } from "../types.js";

export type ResearchSnippet = {
  title: string;
  snippet: string;
  url?: string;
};

export type CompanyResearchResult = {
  companyName: string;
  summary: string;
  facts: Record<string, unknown>;
  snippets: ResearchSnippet[];
  webSearchesUsed: number;
};

export type SecondaryCandidate = {
  title: string;
  kind: Exclude<CandidateRoleKind, "advertised">;
  confidence: number;
  location: string | null;
  note: string;
};

export async function researchCompany(input: {
  companyName: string;
  existingSummary?: string | null;
  tracker: LimitTracker;
  skipWebSearch?: boolean;
  searchFn?: (query: string) => Promise<ResearchSnippet[]>;
}): Promise<CompanyResearchResult> {
  const facts: Record<string, unknown> = {
    researchedAt: new Date().toISOString(),
  };
  const snippets: ResearchSnippet[] = [];
  let webSearchesUsed = 0;

  if (
    !input.skipWebSearch &&
    input.searchFn &&
    input.tracker.canWebSearch()
  ) {
    input.tracker.recordWebSearch();
    webSearchesUsed = 1;
    try {
      const results = await input.searchFn(
        `${input.companyName} funding hiring expansion`,
      );
      snippets.push(...results.slice(0, 5));
      facts.searchQuery = `${input.companyName} funding hiring expansion`;
      facts.resultCount = results.length;
    } catch (error) {
      facts.searchError =
        error instanceof Error ? error.message : "search failed";
    }
  } else if (!input.tracker.canWebSearch()) {
    facts.searchSkipped = "web_search_limit_reached";
  } else if (input.skipWebSearch) {
    facts.searchSkipped = "skipWebSearch";
  }

  const summary =
    snippets[0]?.snippet ||
    input.existingSummary ||
    `${input.companyName}: evidence refreshed from discovery run.`;

  return {
    companyName: input.companyName,
    summary: summary.slice(0, 500),
    facts,
    snippets,
    webSearchesUsed,
  };
}

/**
 * Derive rumored/inferred candidate roles from research text.
 * Deterministic regex — Eve company_researcher may refine later.
 */
export function deriveSecondaryCandidatesFromResearch(input: {
  companyName: string;
  snippets: ResearchSnippet[];
  summary: string;
  /** Title already covered by an advertised listing — skip duplicates. */
  advertisedTitle?: string | null;
}): SecondaryCandidate[] {
  const corpus = [
    input.summary,
    ...input.snippets.map((s) => `${s.title} ${s.snippet}`),
  ]
    .join("\n")
    .trim();
  if (!corpus) return [];

  const advertised = normalizeTitle(input.advertisedTitle);
  const found = new Map<string, SecondaryCandidate>();

  const rumor =
    /\b(rumou?r(?:ed)?|allegedly|heard (?:that )?they(?:'re| are) hiring|whisper)\b/i.test(
      corpus,
    );
  const hiringTitle =
    corpus.match(
      /\b(?:hiring|looking for|open(?:ing)? for|seeking)\s+(?:a|an)?\s*([A-Z][\w/&+ -]{2,60}?)(?:\s+in\s+([A-Za-z ,]+))?/i,
    ) ??
    corpus.match(
      /\b([A-Z][\w/&+ -]{2,40}(?:Engineer|Manager|Lead|Director|AE|SE))\b/,
    );

  if (hiringTitle?.[1]) {
    const title = hiringTitle[1].trim().replace(/\s+/g, " ");
    if (normalizeTitle(title) !== advertised) {
      const kind: SecondaryCandidate["kind"] = rumor ? "rumored" : "inferred";
      found.set(`${kind}:${normalizeTitle(title)}`, {
        title,
        kind,
        confidence: kind === "rumored" ? 0.45 : 0.55,
        location: hiringTitle[2]?.trim() || null,
        note: rumor
          ? `Rumored opening at ${input.companyName} from public chatter.`
          : `Inferred opening at ${input.companyName} from company research.`,
      });
    }
  } else if (rumor) {
    found.set("rumored:unknown-gtm", {
      title: "GTM / Sales (rumored)",
      kind: "rumored",
      confidence: 0.4,
      location: null,
      note: `Rumored GTM hiring at ${input.companyName}.`,
    });
  }

  return [...found.values()];
}

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
