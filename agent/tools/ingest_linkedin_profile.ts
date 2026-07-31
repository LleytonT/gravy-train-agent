import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  formatCareerIdentitySection,
  detectRoleFamily,
  extractGeographyHints,
  type CareerIdentity,
} from "../lib/role-affinity.js";
import { updateUserProfile, readUserProfile } from "../lib/profile.js";

/**
 * Ingest a LinkedIn (or manually described) career profile into user-profile.md.
 * Capture worker can POST structured fields; chat can pass the same shape.
 */
export default defineTool({
  description:
    "Save the user's LinkedIn career identity (title, company, location, headline) into persistent memory. Call after LinkedIn connect/capture or when they describe their current role. Personalizes Gravy Train role matching.",
  inputSchema: z.object({
    name: z.string().optional(),
    headline: z.string().optional(),
    currentTitle: z.string().optional(),
    currentCompany: z.string().optional(),
    location: z.string().optional(),
    linkedInUrl: z.string().optional(),
    seniority: z.string().optional(),
    summary: z.string().optional(),
    /** If true, also refresh Identity / Targeting sections for consistency. */
    syncIdentitySections: z.boolean().optional(),
  }),
  async execute(input) {
    const roleFamily = detectRoleFamily(
      [input.currentTitle, input.headline].filter(Boolean).join(" | "),
    );
    const geographyHints = extractGeographyHints(
      input.location,
      input.headline,
      input.currentTitle,
      input.summary,
    );

    const identity: CareerIdentity = {
      name: input.name,
      headline: input.headline,
      currentTitle: input.currentTitle,
      currentCompany: input.currentCompany,
      location: input.location,
      linkedInUrl: input.linkedInUrl,
      roleFamily,
      seniority: input.seniority,
      geographyHints,
      summary: input.summary,
    };

    const careerSection = formatCareerIdentitySection(identity);
    updateUserProfile({
      replaceSection: {
        heading: "Career Identity",
        content: careerSection,
      },
    });

    if (input.syncIdentitySections !== false) {
      if (input.name || input.location || input.currentTitle || input.currentCompany) {
        const roleToday =
          input.currentTitle && input.currentCompany
            ? `${input.currentTitle} at ${input.currentCompany}`
            : input.currentTitle ?? input.currentCompany ?? "";
        updateUserProfile({
          replaceSection: {
            heading: "Identity",
            content: [
              `- Name: ${input.name ?? ""}`,
              `- WhatsApp: _(unchanged unless you tell me)_`,
              `- Location: ${input.location ?? ""}`,
              `- Role today: ${roleToday}`,
            ].join("\n"),
          },
        });
      }

      if (input.currentTitle || input.location) {
        updateUserProfile({
          replaceSection: {
            heading: "Targeting",
            content: [
              `- Role: ${input.currentTitle ?? ""}`,
              `- Geography: ${input.location ?? ""}`,
              `- Background: _(from LinkedIn — refine via chat)_`,
              `- Role family: ${roleFamily}`,
            ].join("\n"),
          },
        });
      }
    }

    return {
      saved: true,
      identity: {
        ...identity,
        roleFamily,
        geographyHints,
      },
      profilePreview: readUserProfile().slice(0, 1200),
    };
  },
});
