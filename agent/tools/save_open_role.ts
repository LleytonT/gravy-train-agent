import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";
import { openRoleStatuses } from "../lib/db/schema.js";

/**
 * Record or list open/rumored roles at gravy-train companies for personalization.
 */
export default defineTool({
  description:
    "Save or list open/rumored roles (e.g. Field Engineer Sydney at Decagon) used for personalized role matching.",
  inputSchema: z.object({
    action: z.enum(["list", "save"]),
    company: z.string().optional(),
    title: z.string().optional(),
    location: z.string().optional(),
    sourceUrl: z.string().optional(),
    status: z.enum(openRoleStatuses).optional(),
  }),
  async execute(input) {
    await ensureSchema();

    if (input.action === "save") {
      if (!input.company || !input.title) {
        return { error: "save requires company and title" };
      }
      const company =
        (await repo.getCompanyByName(input.company)) ??
        (await repo.upsertCompany({ name: input.company }));

      const role = await repo.upsertOpenRole({
        companyId: company.id,
        title: input.title,
        location: input.location ?? null,
        sourceUrl: input.sourceUrl ?? null,
        status: input.status ?? "open",
      });

      return {
        saved: true,
        company: { id: company.id, name: company.name },
        role,
      };
    }

    let roles = await repo.listOpenRoles(
      input.status ? { status: input.status } : undefined,
    );

    if (input.company) {
      const company = await repo.getCompanyByName(input.company);
      if (!company) {
        return { found: false, company: input.company, roles: [] };
      }
      roles = roles.filter((r) => r.companyId === company.id);
    }

    const enriched = await Promise.all(
      roles.map(async (role) => {
        const company = await repo.getCompanyById(role.companyId);
        return {
          ...role,
          companyName: company?.name ?? role.companyId,
        };
      }),
    );

    return { count: enriched.length, roles: enriched };
  },
});
