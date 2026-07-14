import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";

export default defineTool({
  description:
    "Write an extracted signal into a company dossier. Upserts the company by name if needed.",
  inputSchema: z.object({
    company: z.string().min(1),
    type: z.string().min(1),
    direction: z.enum(["positive", "negative"]),
    strength: z.number().int().min(1).max(5),
    summary: z.string().min(1).max(500),
    sourceUrl: z.string().optional(),
    excerpt: z.string().max(200).optional(),
    observedAt: z.string().optional(),
    website: z.string().optional(),
    category: z.string().optional(),
    watchlistTier: z.enum(["hot", "warm", "ignore"]).optional(),
    aliases: z.array(z.string()).optional(),
  }),
  async execute(input) {
    await ensureSchema();
    const company = await repo.upsertCompany({
      name: input.company,
      website: input.website,
      category: input.category,
      watchlistTier: input.watchlistTier,
      aliases: input.aliases,
    });

    const signal = await repo.saveSignal({
      companyId: company.id,
      type: input.type,
      direction: input.direction,
      strength: input.strength,
      summary: input.summary,
      sourceUrl: input.sourceUrl,
      excerpt: input.excerpt?.slice(0, 200),
      observedAt: input.observedAt,
    });

    return {
      company: { id: company.id, name: company.name, tier: company.watchlistTier },
      signal: {
        id: signal.id,
        type: signal.type,
        direction: signal.direction,
        strength: signal.strength,
        summary: signal.summary,
      },
    };
  },
});
