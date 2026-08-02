import type { ResearchSnippet } from "./analysts/company-research.js";

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * DuckDuckGo HTML enrichment search shared with the search_web Eve tool.
 * Callers must gate usage through LimitTracker.
 */
export async function searchWeb(query: string): Promise<ResearchSnippet[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "GravyScout/0.1 (+personal research agent; read-only enrichment)",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const html = await res.text();
  const results: ResearchSnippet[] = [];
  const resultRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>)?/gi;
  let match: RegExpExecArray | null;
  while ((match = resultRe.exec(html)) !== null && results.length < 5) {
    const title = stripTags(match[2] ?? "").trim();
    const snippet = stripTags(match[3] ?? "").trim().slice(0, 240);
    if (title) {
      results.push({ title, snippet, url: match[1] });
    }
  }
  return results;
}
