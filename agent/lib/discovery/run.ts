/**
 * Discovery orchestrator — single deep seam for GS-007.
 *
 * Eve schedules and `pnpm test:discovery` call runDiscovery(trigger).
 * Deterministic code owns claims, idempotency, and DB writes; analysts are
 * TypeScript modules (mirrored by Eve subagents for interactive use).
 */

import { inArray } from "drizzle-orm";

import { getDb } from "../db/client.js";
import { sourceItems } from "../db/schema.js";
import type { TelegramBotTransport } from "../telegram-send.js";
import { claimDiscoveryRun, completeDiscoveryRun } from "./claim.js";
import { deliverDigestsForRun } from "./digest.js";
import { createLimitTracker } from "./limits.js";
import { upsertOpportunitiesForMembers } from "./opportunities.js";
import {
  loadUnprocessedSourceItems,
  processSourceItem,
} from "./process-items.js";
import type {
  DiscoveryRunCounts,
  DiscoveryRunOutcome,
  DiscoveryTrigger,
} from "./types.js";
import { DEFAULT_DISCOVERY_LIMITS } from "./types.js";

function emptyCounts(): DiscoveryRunCounts {
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

async function markSourceItemsProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  await db
    .update(sourceItems)
    .set({ processedAt: new Date() })
    .where(inArray(sourceItems.id, ids));
}

/**
 * Idempotent discovery run. Retrying the same idempotencyKey after completion
 * returns already_completed without duplicating signals, opportunities, or digests.
 *
 * Source items are marked processed only after a successful run so a failed
 * mid-pipeline reclaim can resume opportunity/digest work.
 */
export async function runDiscovery(
  trigger: DiscoveryTrigger,
  options?: { telegram?: TelegramBotTransport },
): Promise<DiscoveryRunOutcome> {
  const claim = await claimDiscoveryRun({
    idempotencyKey: trigger.idempotencyKey,
    trigger: trigger.kind,
  });

  if (claim.kind === "already_completed") {
    return claim.outcome;
  }
  // Never fall through on an in-progress claim — concurrent retry must not
  // double-run. Failed runs are reclaimed as `claimed` in claimDiscoveryRun.
  if (claim.kind === "in_progress") {
    return {
      runId: claim.runId,
      status: "already_completed",
      counts: emptyCounts(),
      limits: {
        webSearchesUsed: 0,
        modelCallsUsed: 0,
        maxWebSearches:
          trigger.limits?.maxWebSearches ??
          DEFAULT_DISCOVERY_LIMITS.maxWebSearches,
        maxModelCalls:
          trigger.limits?.maxModelCalls ?? DEFAULT_DISCOVERY_LIMITS.maxModelCalls,
      },
      error: "run_already_in_progress",
    };
  }

  const runId = claim.runId;
  const tracker = createLimitTracker(trigger.limits);
  const counts = emptyCounts();
  const processedIds: string[] = [];

  try {
    const items = await loadUnprocessedSourceItems({
      memberId: trigger.memberId,
      limit: tracker.limits.maxSourceItems,
    });

    const companyIds = new Set<string>();
    const memberIds = new Set<string>();
    if (trigger.memberId) memberIds.add(trigger.memberId);

    for (const item of items) {
      const processed = await processSourceItem({
        item,
        tracker,
        skipWebSearch: trigger.skipWebSearch,
        deferProcessedMark: true,
      });
      counts.sourceItemsProcessed += 1;
      processedIds.push(item.id);
      if (!processed) continue;
      if (processed.createdSignal) counts.signalsUpserted += 1;
      if (processed.createdCandidate) counts.candidatesUpserted += 1;
      if (processed.companyId) {
        companyIds.add(processed.companyId);
        counts.dossiersRefreshed += 1;
      }
      if (processed.memberId) memberIds.add(processed.memberId);
    }

    const opportunityResults =
      companyIds.size === 0
        ? []
        : await upsertOpportunitiesForMembers({
            memberIds: [...memberIds],
            companyIds: [...companyIds],
            tracker,
          });

    for (const result of opportunityResults) {
      if (result.excludedByConstraint) {
        counts.opportunitiesExcludedByConstraint += 1;
      } else if (result.created || result.materialChanged) {
        counts.opportunitiesUpserted += 1;
      }
    }

    const digests = await deliverDigestsForRun({
      discoveryRunId: runId,
      opportunityResults,
      now: trigger.asOf,
      telegram: options?.telegram,
    });
    for (const digest of digests) {
      if (digest.delivered) counts.digestsDelivered += 1;
      if (digest.skipped) counts.digestsSkipped += 1;
    }

    // Mark processed only after opportunities + digests succeed so a failed
    // run can reclaim and finish without losing already-touched items.
    await markSourceItemsProcessed(processedIds);

    const noop =
      counts.sourceItemsProcessed === 0 &&
      counts.opportunitiesUpserted === 0 &&
      counts.digestsDelivered === 0;

    const outcome: DiscoveryRunOutcome = {
      runId,
      status: noop ? "noop" : "completed",
      counts,
      limits: tracker.snapshot(),
    };
    await completeDiscoveryRun(runId, outcome);
    return outcome;
  } catch (error) {
    // Leave source items unprocessed so retry can resume.
    const outcome: DiscoveryRunOutcome = {
      runId,
      status: "failed",
      counts,
      limits: tracker.snapshot(),
      error: error instanceof Error ? error.message : "discovery_failed",
    };
    await completeDiscoveryRun(runId, outcome);
    return outcome;
  }
}
