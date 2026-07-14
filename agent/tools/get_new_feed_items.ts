import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";

export default defineTool({
  description:
    "Fetch unprocessed captured LinkedIn/X feed items from the local DB. Call this first during a nightly scout.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(200).optional(),
  }),
  async execute({ limit }) {
    await ensureSchema();
    const items = await repo.getUnprocessedRawItems(limit ?? 100);
    return {
      count: items.length,
      items: items.map((item) => ({
        id: item.id,
        source: item.source,
        author: item.author,
        authorHeadline: item.authorHeadline,
        excerpt: item.excerpt,
        url: item.url,
        postedAt: item.postedAt,
        capturedAt: item.capturedAt,
      })),
    };
  },
});
