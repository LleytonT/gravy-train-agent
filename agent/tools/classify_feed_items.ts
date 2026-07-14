import { defineTool } from "eve/tools";
import { z } from "zod";

import { classifyBatch } from "../lib/classify.js";
import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";

export default defineTool({
  description:
    "Classify unprocessed (or provided) feed items with the cheap Haiku model. Returns extracted GTM/APAC signals. Prefer this over hand-classifying — saves cost.",
  inputSchema: z.object({
    itemIds: z
      .array(z.string())
      .optional()
      .describe("If omitted, classifies the next unprocessed batch"),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  async execute({ itemIds, limit }) {
    await ensureSchema();
    let items = await repo.getUnprocessedRawItems(limit ?? 40);
    if (itemIds?.length) {
      const idSet = new Set(itemIds);
      items = items.filter((item) => idSet.has(item.id));
    }

    if (items.length === 0) {
      return { signals: [], itemsConsidered: 0, note: "No items to classify" };
    }

    const signals = await classifyBatch(items);
    return {
      itemsConsidered: items.length,
      signalCount: signals.length,
      signals,
      modelNote: "Classification used CLASSIFY_MODEL (cheap/fast)",
    };
  },
});
