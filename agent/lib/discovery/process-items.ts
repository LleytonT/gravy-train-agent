import { createHash, randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "../db/client.js";
import { repo } from "../db/repo.js";
import {
  candidateRoles,
  companyDossiers,
  signalSources,
  signals,
  sourceItems,
} from "../db/schema.js";
import { extractJobAlertFromSourceItem } from "./analysts/job-alert.js";
import { researchCompany } from "./analysts/company-research.js";
import { searchWeb } from "./web-search.js";
import type { LimitTracker } from "./types.js";

export type ProcessedItemResult = {
  sourceItemId: string;
  companyId: string;
  signalId: string | null;
  candidateRoleId: string | null;
  memberId: string | null;
  createdSignal: boolean;
  createdCandidate: boolean;
};

function companyIdFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function signalIdFor(sourceItemId: string): string {
  return `sig_${createHash("sha256").update(sourceItemId).digest("hex").slice(0, 24)}`;
}

export async function loadUnprocessedSourceItems(input: {
  memberId?: string | null;
  limit: number;
}): Promise<
  Array<{
    id: string;
    memberId: string | null;
    title: string | null;
    excerpt: string;
    canonicalUrl: string | null;
    payload: Record<string, unknown>;
    observedAt: Date | null;
    sourceType: string;
  }>
> {
  const db = getDb();
  const conditions = [
    isNull(sourceItems.processedAt),
    eq(sourceItems.sourceType, "job_listing"),
  ];
  if (input.memberId) {
    conditions.push(eq(sourceItems.memberId, input.memberId));
  }

  return db
    .select({
      id: sourceItems.id,
      memberId: sourceItems.memberId,
      title: sourceItems.title,
      excerpt: sourceItems.excerpt,
      canonicalUrl: sourceItems.canonicalUrl,
      payload: sourceItems.payload,
      observedAt: sourceItems.observedAt,
      sourceType: sourceItems.sourceType,
    })
    .from(sourceItems)
    .where(and(...conditions))
    .limit(input.limit);
}

export async function processSourceItem(input: {
  item: Awaited<ReturnType<typeof loadUnprocessedSourceItems>>[number];
  tracker: LimitTracker;
  skipWebSearch?: boolean;
}): Promise<ProcessedItemResult | null> {
  const extraction = extractJobAlertFromSourceItem(input.item);
  if (!extraction) {
    await markProcessed(input.item.id);
    return {
      sourceItemId: input.item.id,
      companyId: "",
      signalId: null,
      candidateRoleId: null,
      memberId: input.item.memberId,
      createdSignal: false,
      createdCandidate: false,
    };
  }

  const timestamp = new Date().toISOString();
  const company = await repo.upsertCompany({
    name: extraction.companyName,
    aliases: [companyIdFromName(extraction.companyName)],
    watchlistTier: "warm",
  });
  const companyId = company.id;

  // Research (budgeted)
  const research = await researchCompany({
    companyName: extraction.companyName,
    tracker: input.tracker,
    skipWebSearch: input.skipWebSearch,
    searchFn: searchWeb,
  });

  const db = getDb();
  const [existingDossier] = await db
    .select()
    .from(companyDossiers)
    .where(eq(companyDossiers.companyId, companyId))
    .limit(1);

  if (existingDossier) {
    await db
      .update(companyDossiers)
      .set({
        summary: research.summary,
        facts: { ...existingDossier.facts, ...research.facts },
        version: existingDossier.version + 1,
        refreshedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companyDossiers.id, existingDossier.id));
  } else {
    await db.insert(companyDossiers).values({
      companyId,
      summary: research.summary,
      facts: research.facts,
      version: 1,
    });
  }

  const signalId = signalIdFor(input.item.id);
  let createdSignal = false;
  const [existingSignal] = await db
    .select({ id: signals.id })
    .from(signals)
    .where(eq(signals.id, signalId))
    .limit(1);

  if (!existingSignal) {
    await db.insert(signals).values({
      id: signalId,
      companyId,
      memberId: input.item.memberId,
      type: "job_alert_listing",
      direction: "positive",
      strength: extraction.confidence,
      summary: `${extraction.title} at ${extraction.companyName}${extraction.location ? ` (${extraction.location})` : ""}`,
      sourceUrl: extraction.canonicalUrl,
      excerpt: extraction.excerpt.slice(0, 200),
      observedAt: (input.item.observedAt ?? new Date()).toISOString(),
      createdAt: timestamp,
    });
    createdSignal = true;
  }

  await db
    .insert(signalSources)
    .values({
      signalId,
      sourceItemId: input.item.id,
    })
    .onConflictDoNothing();

  let candidateRoleId: string | null = null;
  let createdCandidate = false;
  if (input.item.memberId) {
    const [existingRole] = await db
      .select({ id: candidateRoles.id })
      .from(candidateRoles)
      .where(
        and(
          eq(candidateRoles.memberId, input.item.memberId),
          eq(candidateRoles.companyId, companyId),
          eq(candidateRoles.title, extraction.title),
          eq(candidateRoles.kind, extraction.kind),
          extraction.canonicalUrl
            ? eq(candidateRoles.canonicalUrl, extraction.canonicalUrl)
            : isNull(candidateRoles.canonicalUrl),
        ),
      )
      .limit(1);

    if (existingRole) {
      candidateRoleId = existingRole.id;
      await db
        .update(candidateRoles)
        .set({
          location: extraction.location,
          confidence: extraction.confidence,
          sourceItemId: input.item.id,
          updatedAt: new Date(),
        })
        .where(eq(candidateRoles.id, existingRole.id));
    } else {
      const id = randomUUID();
      await db.insert(candidateRoles).values({
        id,
        memberId: input.item.memberId,
        companyId,
        sourceItemId: input.item.id,
        title: extraction.title,
        location: extraction.location,
        kind: extraction.kind,
        status: "active",
        canonicalUrl: extraction.canonicalUrl,
        confidence: extraction.confidence,
        observedAt: input.item.observedAt ?? new Date(),
      });
      candidateRoleId = id;
      createdCandidate = true;
    }
  }

  await markProcessed(input.item.id);

  return {
    sourceItemId: input.item.id,
    companyId,
    signalId,
    candidateRoleId,
    memberId: input.item.memberId,
    createdSignal,
    createdCandidate,
  };
}

async function markProcessed(sourceItemId: string): Promise<void> {
  const db = getDb();
  await db
    .update(sourceItems)
    .set({ processedAt: new Date() })
    .where(eq(sourceItems.id, sourceItemId));
}
