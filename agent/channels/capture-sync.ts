import { defineChannel, POST } from "eve/channels";

import { ensureSchema } from "../lib/db/client.js";
import { repo } from "../lib/db/repo.js";

/**
 * Authenticated capture sync endpoint for Phase 5.
 * Local Playwright on the Mac POSTs feed items here after capture.
 *
 * Route: POST /eve/v1/capture-sync/items
 * Auth:  Authorization: Bearer $CAPTURE_SYNC_TOKEN
 */

type SyncItem = {
  source: "linkedin" | "x";
  author: string;
  authorHeadline?: string | null;
  excerpt: string;
  url: string;
  postedAt?: string | null;
};

export default defineChannel({
  routes: [
    POST("/eve/v1/capture-sync/items", async (req) => {
      const token = process.env.CAPTURE_SYNC_TOKEN;
      if (!token) {
        return Response.json(
          { error: "CAPTURE_SYNC_TOKEN not configured on server" },
          { status: 503 },
        );
      }

      const auth = req.headers.get("authorization") ?? "";
      const expected = `Bearer ${token}`;
      if (auth !== expected) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      let body: { items?: SyncItem[] };
      try {
        body = (await req.json()) as { items?: SyncItem[] };
      } catch {
        return Response.json({ error: "invalid JSON" }, { status: 400 });
      }

      const items = body.items ?? [];
      if (!Array.isArray(items) || items.length === 0) {
        return Response.json({ inserted: 0, received: 0 });
      }

      const cleaned: SyncItem[] = [];
      for (const item of items) {
        if (
          !item ||
          (item.source !== "linkedin" && item.source !== "x") ||
          typeof item.author !== "string" ||
          typeof item.excerpt !== "string" ||
          typeof item.url !== "string"
        ) {
          continue;
        }
        cleaned.push({
          source: item.source,
          author: item.author,
          authorHeadline: item.authorHeadline ?? null,
          excerpt: String(item.excerpt).slice(0, 200),
          url: item.url,
          postedAt: item.postedAt ?? null,
        });
      }

      await ensureSchema();
      const inserted = await repo.insertRawItems(cleaned);
      return Response.json({
        received: items.length,
        accepted: cleaned.length,
        inserted,
      });
    }),
  ],
});
