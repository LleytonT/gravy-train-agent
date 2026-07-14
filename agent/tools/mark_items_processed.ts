import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";

export default defineTool({
  description: "Mark raw feed items as processed after classification.",
  inputSchema: z.object({
    itemIds: z.array(z.string()).min(1),
  }),
  async execute({ itemIds }) {
    await ensureSchema();
    const count = await repo.markRawItemsProcessed(itemIds);
    return { marked: count, itemIds };
  },
});
