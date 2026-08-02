import { eq } from "drizzle-orm";

import { getDb } from "../db/client.js";
import { inboundQuarantine } from "../db/schema.js";
import { clipExcerpt } from "./retention.js";
import type { QuarantineInput } from "./types.js";

export type QuarantineRecord = {
  id: string;
  created: boolean;
  reason: string;
};

/**
 * Persist an observable quarantine row. Idempotent on provider receipt key.
 */
export async function quarantineInbound(
  input: QuarantineInput,
): Promise<QuarantineRecord> {
  const db = getDb();
  const [existing] = await db
    .select({
      id: inboundQuarantine.id,
      reason: inboundQuarantine.reason,
    })
    .from(inboundQuarantine)
    .where(eq(inboundQuarantine.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (existing) {
    return { id: existing.id, created: false, reason: existing.reason };
  }

  try {
    const [row] = await db
      .insert(inboundQuarantine)
      .values({
        memberId: input.memberId ?? null,
        provider: input.provider,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        recipientAddress: input.recipientAddress ?? null,
        subject: input.subject ?? null,
        excerpt: clipExcerpt(input.excerpt ?? "", 500),
        payload: input.payload ?? {},
      })
      .returning({
        id: inboundQuarantine.id,
        reason: inboundQuarantine.reason,
      });
    if (!row) {
      throw new Error("Failed to insert quarantine row");
    }
    return { id: row.id, created: true, reason: row.reason };
  } catch {
    const [raced] = await db
      .select({
        id: inboundQuarantine.id,
        reason: inboundQuarantine.reason,
      })
      .from(inboundQuarantine)
      .where(eq(inboundQuarantine.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (!raced) throw new Error("Quarantine insert raced without row");
    return { id: raced.id, created: false, reason: raced.reason };
  }
}
