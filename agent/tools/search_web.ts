import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Lightweight enrichment search. Uses DuckDuckGo HTML (no API key) as a
 * swappable data-source — replace with a proper search API later if needed.
 * Cap: callers should stay ≤5 searches per nightly run.
 */
export default defineTool({
  description:
    "Verify or enrich a company/signal via web search (funding stage, HQ, APAC presence). Cap at 5 searches per nightly run.",
  inputSchema: z.object({
    query: z.string().min(3).max(200),
  }),
  async execute({ query }) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "GravyScout/0.1 (+personal research agent; read-only enrichment)",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        return {
          query,
          ok: false,
          error: `HTTP ${res.status}`,
          results: [],
        };
      }
      const html = await res.text();
      const results: { title: string; snippet: string; url?: string }[] = [];
      const resultRe =
        /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>)?/gi;
      let match: RegExpExecArray | null;
      while ((match = resultRe.exec(html)) !== null && results.length < 5) {
        const title = stripTags(match[2] ?? "").trim();
        const snippet = stripTags(match[3] ?? "").trim().slice(0, 240);
        const href = match[1];
        if (title) {
          results.push({ title, snippet, url: href });
        }
      }

      if (results.length === 0) {
        // Fallback: pull plain text snippets if markup shifts
        const text = stripTags(html).replace(/\s+/g, " ").slice(0, 1200);
        return {
          query,
          ok: true,
          results: text
            ? [{ title: "Search page excerpt", snippet: text.slice(0, 400) }]
            : [],
          note: "Sparse parse — treat as weak evidence only",
        };
      }

      return { query, ok: true, results };
    } catch (error) {
      return {
        query,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        results: [],
      };
    }
  },
});

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
}
