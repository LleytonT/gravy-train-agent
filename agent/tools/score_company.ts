import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";
import { parsePreferences, readUserProfile } from "../lib/profile.js";
import { scoreCompany } from "../lib/scoring.js";

export default defineTool({
  description:
    "Recompute the Gravy Train Index for a company from its stored signals (deterministic + preference-aware).",
  inputSchema: z.object({
    company: z.string().min(1),
  }),
  async execute({ company }) {
    await ensureSchema();
    const dossier = await repo.getCompanyDossier(company);
    if (!dossier) {
      return { found: false, company };
    }

    const profile = readUserProfile();
    const prefs = parsePreferences(profile);
    const result = scoreCompany(dossier.signals, {
      ...prefs,
      watchlistTier: dossier.company.watchlistTier,
      companyCategory: dossier.company.category,
      companyName: dossier.company.name,
    });

    return {
      found: true,
      company: {
        id: dossier.company.id,
        name: dossier.company.name,
        tier: dossier.company.watchlistTier,
      },
      ...result,
    };
  },
});
