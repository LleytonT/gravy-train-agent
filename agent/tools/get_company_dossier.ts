import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";

export default defineTool({
  description:
    "Read a company dossier: profile, decayed signals, opportunities, and current score inputs.",
  inputSchema: z.object({
    company: z.string().min(1).describe("Company id or name"),
  }),
  async execute({ company }) {
    await ensureSchema();
    const dossier = await repo.getCompanyDossier(company);
    if (!dossier) {
      return { found: false, company };
    }
    return {
      found: true,
      company: dossier.company,
      signals: dossier.signals,
      opportunities: dossier.opportunities,
    };
  },
});
