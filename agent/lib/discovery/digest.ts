import { eq } from "drizzle-orm";

import {
  appendMessage,
  createConversation,
  listConversations,
} from "../conversation.js";
import { getDb } from "../db/client.js";
import { digestDeliveries, opportunities } from "../db/schema.js";
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

export async function deliverDigestsForRun(input: {
  discoveryRunId: string;
  opportunityResults: OpportunityUpsertResult[];
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
      const [skipped] = await db
        .insert(digestDeliveries)
        .values({
          memberId,
          discoveryRunId: input.discoveryRunId,
          channel: "system",
          idempotencyKey,
          status: "skipped",
          error: "no_material_changes",
          attemptedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: digestDeliveries.id });

      results.push({
        memberId,
        delivered: false,
        skipped: true,
        reason: "no_material_changes",
        deliveryId: skipped?.id,
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

    let conversationId: string;
    const existing = await listConversations(memberId, { limit: 1 });
    if (existing.conversations[0]) {
      conversationId = existing.conversations[0].id;
    } else {
      const created = await createConversation(memberId, {
        title: "Opportunity digests",
      });
      conversationId = created.id;
    }

    const body = formatDigest(materialRows);
    await appendMessage({
      memberId,
      conversationId,
      role: "assistant",
      surface: "system",
      body,
      idempotencyKey: `msg:${idempotencyKey}`,
    });

    if (existingDelivery) {
      await db
        .update(digestDeliveries)
        .set({
          status: "sent",
          conversationId,
          deliveredAt: new Date(),
          attemptedAt: new Date(),
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(digestDeliveries.id, existingDelivery.id));
      results.push({
        memberId,
        delivered: true,
        skipped: false,
        deliveryId: existingDelivery.id,
      });
    } else {
      const [created] = await db
        .insert(digestDeliveries)
        .values({
          memberId,
          discoveryRunId: input.discoveryRunId,
          conversationId,
          channel: "system",
          idempotencyKey,
          status: "sent",
          attemptedAt: new Date(),
          deliveredAt: new Date(),
        })
        .returning({ id: digestDeliveries.id });
      results.push({
        memberId,
        delivered: true,
        skipped: false,
        deliveryId: created?.id,
      });
    }

    for (const row of materialRows) {
      await db
        .update(opportunities)
        .set({
          status: "pinged",
          pingedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(opportunities.id, row.id));
    }
  }

  return results;
}
