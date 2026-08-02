import { defineTool } from "eve/tools";
import { z } from "zod";

import { ingestResumeText } from "../lib/career-profile.js";
import { requireMemberCaller } from "../lib/identity.js";

/**
 * Explicit member action to store résumé text on the structured career profile.
 * Does not scrape LinkedIn or mailboxes.
 */
export default defineTool({
  description:
    "Ingest résumé text the member pasted or uploaded. Stores it on their structured career profile for personalization. Only call when the member explicitly provides a résumé.",
  inputSchema: z.object({
    text: z.string().min(40).max(100_000),
    fileName: z.string().optional(),
    source: z.enum(["paste", "upload"]).optional(),
  }),
  async execute({ text, fileName, source }, ctx) {
    const { memberId } = requireMemberCaller(ctx);
    const snapshot = await ingestResumeText({
      memberId,
      text,
      fileName,
      source,
    });
    return {
      saved: true,
      memberId,
      chars: text.trim().length,
      fileName: fileName ?? null,
      identity: snapshot.identity,
      content: snapshot.modelContextMarkdown,
    };
  },
});
