import { defineTool } from "eve/tools";
import { z } from "zod";

import { searchWeb } from "../../../lib/discovery/web-search.js";

export default defineTool({
  description:
    "Public web search for company enrichment. Respect the parent's search budget (default ≤5 per discovery run).",
  inputSchema: z.object({
    query: z.string().min(3).max(200),
  }),
  async execute({ query }) {
    try {
      const results = await searchWeb(query);
      return { query, ok: true, results };
    } catch (error) {
      return {
        query,
        ok: false,
        error: error instanceof Error ? error.message : "search failed",
        results: [],
      };
    }
  },
});
