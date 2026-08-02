/**
 * Idempotent source-item ingestion seam.
 *
 * Receipts dedupe webhook retries. Content hashes collapse/link the same
 * listing across boards. Callers never speak provider payload shapes here.
 */

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "../db/client.js";
import { sourceItemReceipts, sourceItems } from "../db/schema.js";
import type { IngestResult, SourceItemInput } from "./types.js";
import { clipExcerpt } from "./retention.js";

async function findExistingSourceItem(input: SourceItemInput) {
  const db = getDb();
  if (input.memberId === null) {
    const [row] = await db
      .select({ id: sourceItems.id })
      .from(sourceItems)
      .where(
        and(
          isNull(sourceItems.memberId),
          eq(sourceItems.sourceType, input.sourceType),
          eq(sourceItems.contentHash, input.contentHash),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  const [row] = await db
    .select({ id: sourceItems.id })
    .from(sourceItems)
    .where(
      and(
        eq(sourceItems.memberId, input.memberId),
        eq(sourceItems.sourceType, input.sourceType),
        eq(sourceItems.contentHash, input.contentHash),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function ingestSourceItems(
  inputs: SourceItemInput[],
): Promise<IngestResult> {
  const db = getDb();
  const items: IngestResult["items"] = [];
  let insertedCount = 0;
  let duplicateReceiptCount = 0;
  let linkedExistingCount = 0;

  for (const input of inputs) {
    const [existingReceipt] = await db
      .select({
        id: sourceItemReceipts.id,
        sourceItemId: sourceItemReceipts.sourceItemId,
      })
      .from(sourceItemReceipts)
      .where(eq(sourceItemReceipts.idempotencyKey, input.receipt.idempotencyKey))
      .limit(1);

    if (existingReceipt) {
      duplicateReceiptCount += 1;
      items.push({
        id: existingReceipt.sourceItemId,
        contentHash: input.contentHash,
        created: false,
        receiptCreated: false,
      });
      continue;
    }

    let sourceItemId: string;
    let created = false;
    const existing = await findExistingSourceItem(input);
    if (existing) {
      sourceItemId = existing.id;
      linkedExistingCount += 1;
    } else {
      try {
        const [inserted] = await db
          .insert(sourceItems)
          .values({
            memberId: input.memberId,
            sourceType: input.sourceType,
            visibility: input.visibility,
            externalId: input.externalId ?? null,
            canonicalUrl: input.canonicalUrl ?? null,
            contentHash: input.contentHash,
            title: input.title ?? null,
            excerpt: clipExcerpt(input.excerpt),
            payload: input.payload ?? {},
            observedAt: input.observedAt ?? null,
          })
          .returning({ id: sourceItems.id });
        if (!inserted) {
          throw new Error("Failed to insert source item");
        }
        sourceItemId = inserted.id;
        created = true;
        insertedCount += 1;
      } catch (error) {
        // Race on unique (member, type, hash): link to the winner.
        const raced = await findExistingSourceItem(input);
        if (!raced) throw error;
        sourceItemId = raced.id;
        linkedExistingCount += 1;
      }
    }

    try {
      await db.insert(sourceItemReceipts).values({
        sourceItemId,
        provider: input.receipt.provider,
        idempotencyKey: input.receipt.idempotencyKey,
        metadata: input.receipt.metadata ?? {},
      });
      items.push({
        id: sourceItemId,
        contentHash: input.contentHash,
        created,
        receiptCreated: true,
      });
    } catch {
      // Receipt unique race from concurrent retries.
      duplicateReceiptCount += 1;
      items.push({
        id: sourceItemId,
        contentHash: input.contentHash,
        created,
        receiptCreated: false,
      });
    }
  }

  return {
    items,
    insertedCount,
    duplicateReceiptCount,
    linkedExistingCount,
  };
}
