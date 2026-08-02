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
import {
  deriveSecondaryCandidatesFromResearch,
  researchCompany,
} from "./analysts/company-research.js";
import { searchWeb } from "./web-search.js";
import type { CandidateRoleKind, LimitTracker } from "./types.js";

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

async function upsertCandidateRole(input: {
  memberId: string;
  companyId: string;
  sourceItemId: string;
  title: string;
  location: string | null;
  kind: CandidateRoleKind;
  confidence: number;
  canonicalUrl: string | null;
  observedAt: Date | null;
}): Promise<{ id: string; created: boolean }> {
  const db = getDb();
  const [existingRole] = await db
    .select({ id: candidateRoles.id })
    .from(candidateRoles)
    .where(
      and(
        eq(candidateRoles.memberId, input.memberId),
        eq(candidateRoles.companyId, input.companyId),
        eq(candidateRoles.title, input.title),
        eq(candidateRoles.kind, input.kind),
        input.canonicalUrl
          ? eq(candidateRoles.canonicalUrl, input.canonicalUrl)
          : isNull(candidateRoles.canonicalUrl),
      ),
    )
    .limit(1);

  if (existingRole) {
    await db
      .update(candidateRoles)
      .set({
        location: input.location,
        confidence: input.confidence,
        sourceItemId: input.sourceItemId,
        updatedAt: new Date(),
      })
      .where(eq(candidateRoles.id, existingRole.id));
    return { id: existingRole.id, created: false };
  }

  const id = randomUUID();
  await db.insert(candidateRoles).values({
    id,
    memberId: input.memberId,
    companyId: input.companyId,
    sourceItemId: input.sourceItemId,
    title: input.title,
    location: input.location,
    kind: input.kind,
    status: "active",
    canonicalUrl: input.canonicalUrl,
    confidence: input.confidence,
    observedAt: input.observedAt ?? new Date(),
  });
  return { id, created: true };
}

export async function processSourceItem(input: {
  item: Awaited<ReturnType<typeof loadUnprocessedSourceItems>>[number];
  tracker: LimitTracker;
  skipWebSearch?: boolean;
  /**
   * When true, leave processedAt null so the orchestrator can mark after
   * opportunities/digests succeed (failed-run resume).
   */
  deferProcessedMark?: boolean;
}): Promise<ProcessedItemResult | null> {
  input.tracker.recordModelCall(); // job_alert_analyst
  const extraction = extractJobAlertFromSourceItem(input.item);
  if (!extraction) {
    // Unparseable items will never succeed on retry — mark immediately.
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

  input.tracker.recordModelCall(); // company_researcher
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
    // signals.strength is integer 1–5 (same clamp as repo.saveSignal).
    const strength = Math.min(
      5,
      Math.max(1, Math.round(extraction.confidence * 5)),
    );
    await db.insert(signals).values({
      id: signalId,
      companyId,
      memberId: input.item.memberId,
      type: "job_alert_listing",
      direction: "positive",
      strength,
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
    const advertised = await upsertCandidateRole({
      memberId: input.item.memberId,
      companyId,
      sourceItemId: input.item.id,
      title: extraction.title,
      location: extraction.location,
      kind: extraction.kind,
      confidence: extraction.confidence,
      canonicalUrl: extraction.canonicalUrl,
      observedAt: input.item.observedAt,
    });
    candidateRoleId = advertised.id;
    createdCandidate = advertised.created;

    const researchNotes =
      typeof input.item.payload.researchNotes === "string"
        ? input.item.payload.researchNotes
        : "";
    const secondary = deriveSecondaryCandidatesFromResearch({
      companyName: extraction.companyName,
      snippets: [
        ...research.snippets,
        ...(researchNotes
          ? [{ title: "source_payload", snippet: researchNotes }]
          : []),
      ],
      summary: research.summary,
      advertisedTitle: extraction.title,
    });

    for (const extra of secondary) {
      const upserted = await upsertCandidateRole({
        memberId: input.item.memberId,
        companyId,
        sourceItemId: input.item.id,
        title: extra.title,
        location: extra.location,
        kind: extra.kind,
        confidence: extra.confidence,
        canonicalUrl: null,
        observedAt: input.item.observedAt,
      });
      if (upserted.created) createdCandidate = true;
    }
  }

  if (!input.deferProcessedMark) {
    await markProcessed(input.item.id);
  }

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
