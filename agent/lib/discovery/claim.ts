import { eq } from "drizzle-orm";

import { getDb } from "../db/client.js";
import { discoveryRuns } from "../db/schema.js";
import type { DiscoveryRunOutcome, DiscoveryTriggerKind } from "./types.js";

export type ClaimedRun =
  | {
      kind: "claimed";
      runId: string;
    }
  | {
      kind: "already_completed";
      outcome: DiscoveryRunOutcome;
    }
  | {
      kind: "in_progress";
      runId: string;
    };

export async function claimDiscoveryRun(input: {
  idempotencyKey: string;
  trigger: DiscoveryTriggerKind;
}): Promise<ClaimedRun> {
  const db = getDb();
  const key = input.idempotencyKey.trim();
  if (!key) throw new Error("idempotencyKey is required");

  const [existing] = await db
    .select()
    .from(discoveryRuns)
    .where(eq(discoveryRuns.idempotencyKey, key))
    .limit(1);

  if (existing) {
    if (existing.status === "completed") {
      const outcome = existing.outcome as unknown as DiscoveryRunOutcome;
      return {
        kind: "already_completed",
        outcome: {
          runId: existing.id,
          status: "already_completed",
          counts: outcome.counts ?? emptyCounts(),
          limits: outcome.limits ?? emptyLimits(),
        },
      };
    }
    if (existing.status === "running" || existing.status === "pending") {
      return { kind: "in_progress", runId: existing.id };
    }
    // failed → allow retry by reclaiming
    const now = new Date();
    await db
      .update(discoveryRuns)
      .set({
        status: "running",
        trigger: input.trigger,
        startedAt: now,
        finishedAt: null,
        error: null,
        outcome: {},
        updatedAt: now,
      })
      .where(eq(discoveryRuns.id, existing.id));
    return { kind: "claimed", runId: existing.id };
  }

  const now = new Date();
  try {
    const [created] = await db
      .insert(discoveryRuns)
      .values({
        idempotencyKey: key,
        status: "running",
        trigger: input.trigger,
        startedAt: now,
        outcome: {},
      })
      .returning({ id: discoveryRuns.id });
    if (!created) throw new Error("Failed to claim discovery run");
    return { kind: "claimed", runId: created.id };
  } catch {
    const [raced] = await db
      .select()
      .from(discoveryRuns)
      .where(eq(discoveryRuns.idempotencyKey, key))
      .limit(1);
    if (raced?.status === "completed") {
      const outcome = raced.outcome as unknown as DiscoveryRunOutcome;
      return {
        kind: "already_completed",
        outcome: {
          runId: raced.id,
          status: "already_completed",
          counts: outcome.counts ?? emptyCounts(),
          limits: outcome.limits ?? emptyLimits(),
        },
      };
    }
    if (raced) return { kind: "in_progress", runId: raced.id };
    throw new Error("Failed to claim discovery run after race");
  }
}

export async function completeDiscoveryRun(
  runId: string,
  outcome: DiscoveryRunOutcome,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(discoveryRuns)
    .set({
      status: outcome.status === "failed" ? "failed" : "completed",
      finishedAt: now,
      outcome: outcome as unknown as Record<string, unknown>,
      error: outcome.error ?? null,
      updatedAt: now,
    })
    .where(eq(discoveryRuns.id, runId));
}

function emptyCounts() {
  return {
    sourceItemsProcessed: 0,
    signalsUpserted: 0,
    dossiersRefreshed: 0,
    candidatesUpserted: 0,
    opportunitiesUpserted: 0,
    opportunitiesExcludedByConstraint: 0,
    digestsDelivered: 0,
    digestsSkipped: 0,
  };
}

function emptyLimits() {
  return {
    webSearchesUsed: 0,
    modelCallsUsed: 0,
    maxWebSearches: 0,
    maxModelCalls: 0,
  };
}
