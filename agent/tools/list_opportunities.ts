import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import {
  fixtureListOpportunities,
  isEvalFixture,
} from "../lib/eval-fixture/index.js";
import { requireMemberCaller } from "../lib/identity.js";
import { repo } from "../lib/db/repo.js";

export default defineTool({
  description: "List recent opportunities (new/pinged/discussed/etc).",
  inputSchema: z.object({
    status: z
      .enum(["new", "pinged", "discussed", "dismissed", "pursuing"])
      .optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  async execute({ status, limit }, ctx) {
    if (isEvalFixture()) {
      requireMemberCaller(ctx);
      return fixtureListOpportunities({ limit });
    }

    await ensureSchema();
    const { memberId } = requireMemberCaller(ctx);
    const rows = await repo.listOpportunities({
      memberId,
      includeShared: true,
      status,
      limit: limit ?? 20,
    });
    return { count: rows.length, opportunities: rows, memberId };
  },
});
