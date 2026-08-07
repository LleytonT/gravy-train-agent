/**
 * Digest / proactive delivery status helpers.
 * Status rows are member-scoped and idempotent on `idempotency_key`.
 */

import { eq } from "drizzle-orm";

import { getDb } from "./db/client.js";
import {
  digestDeliveries,
  type ConversationSurface,
  type DeliveryStatus,
} from "./db/schema.js";

export type RecordDeliveryInput = {
  memberId: string;
  channel: ConversationSurface;
  idempotencyKey: string;
  conversationId?: string | null;
  discoveryRunId?: string | null;
  status: DeliveryStatus;
  providerMessageId?: string | null;
  error?: string | null;
};

export type DeliveryRecord = {
  id: string;
  memberId: string;
  channel: ConversationSurface;
  idempotencyKey: string;
  status: DeliveryStatus;
  providerMessageId: string | null;
  error: string | null;
  created: boolean;
};

/**
 * Insert or update a delivery row by idempotency key.
 * Replays with the same key return the existing row without duplicating.
 */
export async function recordDelivery(
  input: RecordDeliveryInput,
): Promise<DeliveryRecord> {
  const db = getDb();
  const now = new Date();
  const attemptedAt =
    input.status === "pending" ? null : now;
  const deliveredAt = input.status === "sent" ? now : null;

  const [inserted] = await db
    .insert(digestDeliveries)
    .values({
      memberId: input.memberId,
      channel: input.channel,
      idempotencyKey: input.idempotencyKey,
      conversationId: input.conversationId ?? null,
      discoveryRunId: input.discoveryRunId ?? null,
      status: input.status,
      providerMessageId: input.providerMessageId ?? null,
      error: input.error ?? null,
      attemptedAt,
      deliveredAt,
    })
    .onConflictDoNothing({ target: digestDeliveries.idempotencyKey })
    .returning();

  if (inserted) {
    return {
      id: inserted.id,
      memberId: inserted.memberId,
      channel: inserted.channel,
      idempotencyKey: inserted.idempotencyKey,
      status: inserted.status,
      providerMessageId: inserted.providerMessageId,
      error: inserted.error,
      created: true,
    };
  }

  const [existing] = await db
    .select()
    .from(digestDeliveries)
    .where(eq(digestDeliveries.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (!existing) {
    throw new Error("Delivery row missing after conflict");
  }

  // Allow terminal updates for the same idempotency key (retry → sent/failed).
  if (
    existing.status === "pending" ||
    (existing.status === "failed" && input.status === "sent")
  ) {
    const [updated] = await db
      .update(digestDeliveries)
      .set({
        status: input.status,
        providerMessageId:
          input.providerMessageId ?? existing.providerMessageId,
        error: input.error ?? null,
        attemptedAt: attemptedAt ?? existing.attemptedAt,
        deliveredAt: deliveredAt ?? existing.deliveredAt,
        updatedAt: now,
      })
      .where(eq(digestDeliveries.id, existing.id))
      .returning();
    return {
      id: updated!.id,
      memberId: updated!.memberId,
      channel: updated!.channel,
      idempotencyKey: updated!.idempotencyKey,
      status: updated!.status,
      providerMessageId: updated!.providerMessageId,
      error: updated!.error,
      created: false,
    };
  }

  return {
    id: existing.id,
    memberId: existing.memberId,
    channel: existing.channel,
    idempotencyKey: existing.idempotencyKey,
    status: existing.status,
    providerMessageId: existing.providerMessageId,
    error: existing.error,
    created: false,
  };
}
