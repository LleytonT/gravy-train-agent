/**
 * Company researcher with explicit web-search budget.
 * Live search is optional; deterministic path works offline for tests.
 */

import type { LimitTracker } from "../types.js";

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
