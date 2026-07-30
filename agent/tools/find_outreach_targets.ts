import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";
import {
  suggestOutreachAngles,
  type OutreachTargetInput,
} from "../lib/personalize.js";
import { readUserProfile } from "../lib/profile.js";
import { parseCareerIdentityFromProfile } from "../lib/role-affinity.js";
import { outreachKinds } from "../lib/db/schema.js";

/**
 * List or save outreach targets (hiring manager / peer in seat / adjacent)
 * for a company the user should contact about a role.
 */
export default defineTool({
  description:
    "Find or save the right people to reach out to for a role at a gravy-train company: hiring manager, current person in seat, or adjacent roles.",
  inputSchema: z.object({
    action: z.enum(["list", "save"]),
    company: z.string().min(1),
    kind: z.enum(outreachKinds).optional(),
    // save fields
    name: z.string().optional(),
    title: z.string().optional(),
    linkedInUrl: z.string().optional(),
    whyReachOut: z.string().optional(),
    relatedRoleTitle: z.string().optional(),
  }),
  async execute(input) {
    await ensureSchema();
    const company =
      (await repo.getCompanyByName(input.company)) ??
      (await repo.getCompanyById(input.company));

    if (!company) {
      return { found: false, company: input.company };
    }

    if (input.action === "save") {
      if (!input.name || !input.title || !input.kind || !input.whyReachOut) {
        return {
          error:
            "save requires name, title, kind (hiring_manager|peer_in_seat|adjacent), and whyReachOut",
        };
      }

      const saved = await repo.upsertOutreachTarget({
        companyId: company.id,
        name: input.name,
        title: input.title,
        kind: input.kind,
        linkedInUrl: input.linkedInUrl ?? null,
        whyReachOut: input.whyReachOut,
        relatedRoleTitle: input.relatedRoleTitle ?? null,
      });

      // Also mirror onto people watchlist for nightly move detection (no dupes)
      const existingPeople = await repo.listPeopleWatchlist();
      const alreadyWatched = existingPeople.some(
        (p) => p.name.trim().toLowerCase() === input.name!.trim().toLowerCase(),
      );
      if (!alreadyWatched) {
        await repo.addPerson({
          name: input.name,
          currentCompany: company.name,
          whyWatched: `${input.kind}: ${input.whyReachOut}`,
          sourceUrl: input.linkedInUrl ?? null,
        });
      }

      return {
        saved: true,
        company: { id: company.id, name: company.name },
        target: saved,
      };
    }

    const targets = await repo.listOutreachTargets({
      companyId: company.id,
      kind: input.kind,
    });

    const identity = parseCareerIdentityFromProfile(readUserProfile());
    const stubRec = {
      companyId: company.id,
      companyName: company.name,
      companyTier: company.watchlistTier,
      companyCategory: company.category,
      recommendedTitles: input.relatedRoleTitle
        ? [input.relatedRoleTitle]
        : ["Sales Engineer", "Field Engineer", "Deployment Engineer"],
      roleFit: 1,
      gravyScore: 0,
      pingTier: "none" as const,
      why: [],
      geographyFit: false,
      matchedSignals: [],
    };

    const enriched = targets.map((t) => {
      const asInput: OutreachTargetInput = {
        companyId: t.companyId,
        companyName: company.name,
        name: t.name,
        title: t.title,
        kind: t.kind,
        linkedInUrl: t.linkedInUrl,
        whyReachOut: t.whyReachOut,
        relatedRoleTitle: t.relatedRoleTitle,
      };
      return {
        ...t,
        angle: suggestOutreachAngles(identity, stubRec, asInput),
      };
    });

    return {
      found: true,
      company: { id: company.id, name: company.name },
      count: enriched.length,
      targets: enriched,
    };
  },
});
