import { defineTool } from "eve/tools";
import { z } from "zod";

import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";

export default defineTool({
  description:
    "Start or finish a nightly run log. Call start at the beginning and finish with counts at the end.",
  inputSchema: z.object({
    action: z.enum(["start", "finish"]),
    runId: z.string().optional(),
    summary: z.string().optional(),
    itemsProcessed: z.number().int().optional(),
    signalsFound: z.number().int().optional(),
    pingsSent: z.number().int().optional(),
  }),
  async execute(input) {
    await ensureSchema();

    if (input.action === "start") {
      const run = await repo.logRunStart();
      return { runId: run.id, startedAt: run.startedAt };
    }

    if (!input.runId) {
      return { error: "runId required to finish" };
    }

    const run = await repo.logRunFinish(input.runId, {
      summary: input.summary,
      itemsProcessed: input.itemsProcessed,
      signalsFound: input.signalsFound,
      pingsSent: input.pingsSent,
    });

    return { run };
  },
});
