import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  getMemberContextSnapshot,
  scoringPrefsFromSnapshot,
} from "../lib/career-profile.js";
import { ensureSchema } from "../lib/db/client.js";
import {
  fixtureScoreCompany,
  isEvalFixture,
} from "../lib/eval-fixture/index.js";
import { requireMemberCaller } from "../lib/identity.js";
import { repo } from "../lib/db/repo.js";
import { scoreCompany } from "../lib/scoring.js";

export default defineTool({
  description:
    "Recompute the Gravy Train Index for a company from its stored signals (deterministic + preference-aware, personalized to the member's role/geography).",
  inputSchema: z.object({
    company: z.string().min(1),
  }),
  async execute({ company }, ctx) {
    if (isEvalFixture()) {
      return fixtureScoreCompany({ company }, ctx);
    }

    await ensureSchema();
    const { memberId } = requireMemberCaller(ctx);
    const dossier = await repo.getCompanyDossier(company);
    if (!dossier) {
      return { found: false, company };
    }

    const snapshot = await getMemberContextSnapshot(memberId);
    const result = scoreCompany(dossier.signals, {
      ...scoringPrefsFromSnapshot(snapshot),
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
      identity: {
        roleFamily: snapshot.identity.roleFamily,
        currentTitle: snapshot.identity.currentTitle,
        currentCompany: snapshot.identity.currentCompany,
        location: snapshot.identity.location,
      },
      ...result,
    };
  },
});
