import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import {
  fixtureCreateOpportunity,
  isEvalFixture,
} from "../lib/eval-fixture/index.js";
import { requireMemberCaller } from "../lib/identity.js";
import { repo } from "../lib/db/repo.js";

export default defineTool({
  description:
    "Create an opportunity row after scoring. Respects 48h per-company ping cooldown — returns skipped=true if recently pinged.",
  inputSchema: z.object({
    company: z.string().min(1),
    headline: z.string().min(1).max(300),
    score: z.number().min(0).max(10),
    pingTier: z.enum(["immediate", "digest"]),
    markPinged: z.boolean().optional().default(true),
  }),
  async execute({ company, headline, score, pingTier, markPinged }, ctx) {
    if (isEvalFixture()) {
      return fixtureCreateOpportunity({ company, headline, score }, ctx);
    }

    await ensureSchema();
    const { memberId } = requireMemberCaller(ctx);
    const dossier = await repo.getCompanyDossier(company);
    if (!dossier) {
      return { created: false, error: `Company not found: ${company}` };
    }

    if (dossier.company.watchlistTier === "ignore") {
      return {
        created: false,
        skipped: true,
        reason: "Company is on ignore tier — dossier-only",
      };
    }

    const recent = await repo.getRecentPingForCompany(
      dossier.company.id,
      48,
      memberId,
    );
    if (recent) {
      return {
        created: false,
        skipped: true,
        reason: "Company already pinged within 48h — roll into next digest",
        recentOpportunityId: recent.id,
      };
    }

    const opportunity = await repo.createOpportunity({
      memberId,
      companyId: dossier.company.id,
      headline: `[${pingTier}] ${headline}`,
      score,
      status: markPinged ? "pinged" : "new",
      pingedAt: markPinged ? new Date().toISOString() : null,
    });

    return {
      created: true,
      opportunity: {
        id: opportunity.id,
        memberId: opportunity.memberId,
        companyId: opportunity.companyId,
        companyName: dossier.company.name,
        headline: opportunity.headline,
        score: opportunity.score,
        status: opportunity.status,
        pingTier,
      },
    };
  },
});
