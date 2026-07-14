import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";

export default defineTool({
  description:
    "List companies on the watchlist (optionally filtered by tier) and/or people on the people-watchlist.",
  inputSchema: z.object({
    tier: z.enum(["hot", "warm", "ignore"]).optional(),
    includePeople: z.boolean().optional(),
  }),
  async execute({ tier, includePeople }) {
    await ensureSchema();
    const companies = await repo.listCompanies(tier ? { tier } : undefined);
    const people = includePeople === false ? [] : await repo.listPeopleWatchlist();
    return {
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        tier: c.watchlistTier,
        category: c.category,
        website: c.website,
      })),
      people: people.map((p) => ({
        id: p.id,
        name: p.name,
        currentCompany: p.currentCompany,
        whyWatched: p.whyWatched,
      })),
    };
  },
});
