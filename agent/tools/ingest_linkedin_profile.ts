import { defineTool } from "eve/tools";
import { z } from "zod";

import { applyExplicitProfileChanges } from "../lib/career-profile.js";
import { requireMemberCaller } from "../lib/identity.js";

/**
 * Ingest a manually described (or captured) career identity into the
 * structured member career profile. LinkedIn scraping is out of scope.
 */
export default defineTool({
  description:
    "Save the member's career identity (title, company, location, headline) into structured profile memory. Call after they describe their current role or finish onboarding. Personalizes Gravy Train role matching.",
  inputSchema: z.object({
    name: z.string().optional(),
    headline: z.string().optional(),
    currentTitle: z.string().optional(),
    currentCompany: z.string().optional(),
    location: z.string().optional(),
    linkedInUrl: z.string().optional(),
    seniority: z.string().optional(),
    summary: z.string().optional(),
    interests: z.array(z.string()).optional(),
    syncIdentitySections: z.boolean().optional(),
  }),
  async execute(input, ctx) {
    const { memberId } = requireMemberCaller(ctx);
    const snapshot = await applyExplicitProfileChanges(memberId, {
      name: input.name,
      headline: input.headline,
      currentTitle: input.currentTitle,
      currentCompany: input.currentCompany,
      location: input.location,
      linkedInUrl: input.linkedInUrl,
      seniority: input.seniority,
      summary: input.summary,
      interests: input.interests,
    });

    return {
      saved: true,
      memberId,
      identity: snapshot.identity,
      content: snapshot.modelContextMarkdown,
      // retained for older prompts that expected a preview string
      preview: snapshot.modelContextMarkdown.slice(0, 1200),
    };
  },
});
