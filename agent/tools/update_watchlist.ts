import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";

export default defineTool({
  description:
    "Add/update a company watchlist tier, or add someone to the people-watchlist. Call when the user says to watch/ignore a company or person.",
  inputSchema: z.object({
    action: z.enum([
      "set_company_tier",
      "upsert_company",
      "add_person",
    ]),
    company: z.string().optional(),
    tier: z.enum(["hot", "warm", "ignore"]).optional(),
    website: z.string().optional(),
    category: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    personName: z.string().optional(),
    currentCompany: z.string().optional(),
    whyWatched: z.string().optional(),
    sourceUrl: z.string().optional(),
  }),
  async execute(input) {
    await ensureSchema();

    if (input.action === "upsert_company" || input.action === "set_company_tier") {
      if (!input.company) {
        return { error: "company required" };
      }
      const company = await repo.upsertCompany({
        name: input.company,
        website: input.website,
        category: input.category,
        aliases: input.aliases,
        watchlistTier: input.tier ?? "hot",
      });
      if (input.tier && company.watchlistTier !== input.tier) {
        const updated = await repo.updateWatchlistTier(company.id, input.tier);
        return { company: updated ?? company };
      }
      return { company };
    }

    if (input.action === "add_person") {
      if (!input.personName) {
        return { error: "personName required" };
      }
      const person = await repo.addPerson({
        name: input.personName,
        currentCompany: input.currentCompany,
        whyWatched: input.whyWatched,
        sourceUrl: input.sourceUrl,
      });
      return { person };
    }

    return { error: "unknown action" };
  },
});
