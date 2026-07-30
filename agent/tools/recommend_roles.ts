import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";
import {
  buildRoleRecommendations,
  pickOutreachForRecommendation,
  suggestOutreachAngles,
  type OutreachTargetInput,
} from "../lib/personalize.js";
import { parsePreferences, readUserProfile } from "../lib/profile.js";
import { parseCareerIdentityFromProfile } from "../lib/role-affinity.js";
import { scoreCompany } from "../lib/scoring.js";

/**
 * Personalized role recommendations across gravy-train companies,
 * tailored to the user's LinkedIn role family + geography.
 */
export default defineTool({
  description:
    "Recommend roles at gravy-train companies personalized to the user's LinkedIn profile (e.g. Sales Engineer at Vercel AU → Field/Deployment/Sales Engineer seats at Decagon, Sierra, Cursor, Fireworks). Includes who to reach out to when known.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(12).optional(),
    includeOutreach: z.boolean().optional(),
    company: z
      .string()
      .optional()
      .describe("Optional: focus recommendations on one company"),
  }),
  async execute({ limit, includeOutreach, company }) {
    await ensureSchema();
    const profile = readUserProfile();
    const prefs = parsePreferences(profile);
    const identity = parseCareerIdentityFromProfile(profile);

    let companies = await repo.listCompanies();
    if (company) {
      const focused = await repo.getCompanyByName(company);
      if (!focused) {
        return { found: false, company, identity };
      }
      companies = [focused];
    }

    const signalsByCompany = new Map<
      string,
      Awaited<ReturnType<typeof repo.getSignalsForCompany>>
    >();
    const scoresByCompany = new Map<
      string,
      ReturnType<typeof scoreCompany>
    >();

    for (const c of companies) {
      const signals = await repo.getSignalsForCompany(c.id);
      signalsByCompany.set(c.id, signals);
      scoresByCompany.set(
        c.id,
        scoreCompany(signals, {
          ...prefs,
          watchlistTier: c.watchlistTier,
          companyCategory: c.category,
          companyName: c.name,
          roleFamily: identity.roleFamily,
          geographyHints: identity.geographyHints,
        }),
      );
    }

    const openRoles = await repo.listOpenRoles();
    const openRoleInputs = await Promise.all(
      openRoles
        .filter((role) => role.status === "open" || role.status === "rumored")
        .map(async (role) => {
        const co = await repo.getCompanyById(role.companyId);
        return {
          companyId: role.companyId,
          companyName: co?.name ?? role.companyId,
          title: role.title,
          location: role.location,
          sourceUrl: role.sourceUrl,
          status: role.status,
        };
      }),
    );

    const result = buildRoleRecommendations({
      profileMarkdown: profile,
      companies,
      signalsByCompany: signalsByCompany as Map<
        string,
        import("../lib/db/schema.js").Signal[]
      >,
      scoresByCompany,
      openRoles: openRoleInputs,
    });

    const capped = result.recommendations.slice(0, limit ?? 8);

    let outreachByCompany: Record<string, unknown[]> = {};
    if (includeOutreach !== false) {
      const targets = await repo.listOutreachTargets();
      const targetInputs: OutreachTargetInput[] = await Promise.all(
        targets.map(async (t) => {
          const co = await repo.getCompanyById(t.companyId);
          return {
            companyId: t.companyId,
            companyName: co?.name ?? t.companyId,
            name: t.name,
            title: t.title,
            kind: t.kind,
            linkedInUrl: t.linkedInUrl,
            whyReachOut: t.whyReachOut,
            relatedRoleTitle: t.relatedRoleTitle,
          };
        }),
      );

      outreachByCompany = {};
      for (const rec of capped) {
        const matched = pickOutreachForRecommendation({
          recommendation: rec,
          targets: targetInputs,
        }).map((t) => ({
          ...t,
          angle: suggestOutreachAngles(result.identity, rec, t),
        }));
        if (matched.length) {
          outreachByCompany[rec.companyName] = matched;
        }
      }
    }

    return {
      identity: result.identity,
      count: capped.length,
      recommendations: capped.map((rec) => ({
        ...rec,
        outreach: outreachByCompany[rec.companyName] ?? [],
      })),
    };
  },
});
