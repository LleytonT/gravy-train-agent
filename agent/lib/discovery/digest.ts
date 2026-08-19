import { eq } from "drizzle-orm";

import {
  appendMessage,
  getOrCreateActiveConversation,
} from "../conversation.js";
import { getDb } from "../db/client.js";
import {
  digestDeliveries,
  opportunities,
  type DeliveryStatus,
} from "../db/schema.js";
import {
  sendProactiveTelegramMessage,
  type TelegramBotTransport,
} from "../telegram-send.js";
import type { OpportunityUpsertResult } from "./opportunities.js";

export type DigestResult = {
  memberId: string;
  delivered: boolean;
  skipped: boolean;
  reason?: string;
  deliveryId?: string;
};

function formatDigest(
  rows: Array<{ headline: string; score: number; rationale: string | null }>,
): string {
  const lines = rows.slice(0, 5).map((row, index) => {
    const rationale = (row.rationale ?? "").slice(0, 160);
    return `${index + 1}. ${row.headline} (${row.score.toFixed(1)})${rationale ? `\n   ${rationale}` : ""}`;
  });
  return `Gravy Scout digest — ${rows.length} material update${rows.length === 1 ? "" : "s"}:\n\n${lines.join("\n\n")}`;
}

async function saveDelivery(input: {
  id?: string;
  memberId: string;
  discoveryRunId: string;
  conversationId?: string | null;
  channel: "telegram" | "system";
  idempotencyKey: string;
  status: DeliveryStatus;
  error?: string | null;
  providerMessageId?: string | null;
}): Promise<string | undefined> {
  const db = getDb();
  const now = new Date();
  const deliveredAt = input.status === "sent" ? now : null;

  if (input.id) {
    await db
      .update(digestDeliveries)
      .set({
        status: input.status,
        channel: input.channel,
        conversationId: input.conversationId ?? null,
        providerMessageId: input.providerMessageId ?? null,
        error: input.error ?? null,
        attemptedAt: now,
        deliveredAt,
        updatedAt: now,
      })
      .where(eq(digestDeliveries.id, input.id));
    return input.id;
  }

  const [created] = await db
    .insert(digestDeliveries)
    .values({
      memberId: input.memberId,
      discoveryRunId: input.discoveryRunId,
      conversationId: input.conversationId ?? null,
      channel: input.channel,
      idempotencyKey: input.idempotencyKey,
      status: input.status,
      providerMessageId: input.providerMessageId ?? null,
      error: input.error ?? null,
      attemptedAt: now,
      deliveredAt,
    })
    .onConflictDoNothing()
    .returning({ id: digestDeliveries.id });
  return created?.id;
}

async function markOpportunitiesPinged(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  const now = new Date().toISOString();
  for (const id of ids) {
    await db
      .update(opportunities)
      .set({
        status: "pinged",
        pingedAt: now,
        updatedAt: now,
      })
      .where(eq(opportunities.id, id));
  }
}

/**
 * Deliver a digest for members with material opportunity changes.
 * Telegram send + canonical conversation row happen together. No-op,
 * quiet hours, and revoked identity skip without messaging the member.
 */
export async function deliverDigestsForRun(input: {
  discoveryRunId: string;
  opportunityResults: OpportunityUpsertResult[];
  now?: Date;
  telegram?: TelegramBotTransport;
}): Promise<DigestResult[]> {
  const materialByMember = new Map<string, string[]>();
  const memberIds = new Set<string>();

  for (const result of input.opportunityResults) {
    memberIds.add(result.memberId);
    if (
      !result.materialChanged ||
      result.excludedByConstraint ||
      !result.opportunityId
    ) {
      continue;
    }
    const list = materialByMember.get(result.memberId) ?? [];
    list.push(result.opportunityId);
    materialByMember.set(result.memberId, list);
  }

  const results: DigestResult[] = [];
  const db = getDb();

  for (const memberId of memberIds) {
    const opportunityIds = materialByMember.get(memberId) ?? [];
    const idempotencyKey = `digest:${input.discoveryRunId}:${memberId}`;

    if (opportunityIds.length === 0) {
      const deliveryId = await saveDelivery({
        memberId,
        discoveryRunId: input.discoveryRunId,
        channel: "system",
        idempotencyKey,
        status: "skipped",
        error: "no_material_changes",
      });
      results.push({
        memberId,
        delivered: false,
        skipped: true,
        reason: "no_material_changes",
        deliveryId,
      });
      continue;
    }

    const [existingDelivery] = await db
      .select()
      .from(digestDeliveries)
      .where(eq(digestDeliveries.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existingDelivery?.status === "sent") {
      results.push({
        memberId,
        delivered: false,
        skipped: true,
        reason: "already_delivered",
        deliveryId: existingDelivery.id,
      });
      continue;
    }

    const materialRows: Array<{
      id: string;
      headline: string;
      score: number;
      rationale: string | null;
    }> = [];
    for (const opportunityId of opportunityIds) {
      const [row] = await db
        .select({
          id: opportunities.id,
          headline: opportunities.headline,
          score: opportunities.score,
          rationale: opportunities.rationale,
        })
        .from(opportunities)
        .where(eq(opportunities.id, opportunityId))
        .limit(1);
      if (row) materialRows.push(row);
    }
    materialRows.sort((a, b) => b.score - a.score);

    if (materialRows.length === 0) {
      results.push({
        memberId,
        delivered: false,
        skipped: true,
        reason: "no_material_changes",
      });
      continue;
    }

    const body = formatDigest(materialRows);
    const send = await sendProactiveTelegramMessage({
      memberId,
      body,
      now: input.now,
      transport: input.telegram,
    });

    if (send.status === "skipped") {
      const deliveryId = await saveDelivery({
        id: existingDelivery?.id,
        memberId,
        discoveryRunId: input.discoveryRunId,
        channel: "telegram",
        idempotencyKey,
        status: "skipped",
        error: send.reason,
      });
      results.push({
        memberId,
        delivered: false,
        skipped: true,
        reason: send.reason,
        deliveryId,
      });
      continue;
    }

    if (send.status === "failed") {
      await saveDelivery({
        id: existingDelivery?.id,
        memberId,
        discoveryRunId: input.discoveryRunId,
        channel: "telegram",
        idempotencyKey,
        status: "failed",
        error: send.error,
      });
      throw new Error(`telegram_digest_failed:${memberId}:${send.error}`);
    }

    const conversation = await getOrCreateActiveConversation(memberId, {
      title: "Opportunity digests",
    });
    await appendMessage({
      memberId,
      conversationId: conversation.id,
      role: "assistant",
      surface: "telegram",
      body,
      idempotencyKey: `msg:${idempotencyKey}`,
      externalMessageId: send.providerMessageId,
    });

    const deliveryId = await saveDelivery({
      id: existingDelivery?.id,
      memberId,
      discoveryRunId: input.discoveryRunId,
      conversationId: conversation.id,
      channel: "telegram",
      idempotencyKey,
      status: "sent",
      providerMessageId: send.providerMessageId,
    });

    await markOpportunitiesPinged(materialRows.map((row) => row.id));

    results.push({
      memberId,
      delivered: true,
      skipped: false,
      deliveryId,
    });
  }

  return results;
}
