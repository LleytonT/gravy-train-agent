/**
 * Member-facing opportunity reads and disposition updates for the product UI.
 */

import { and, desc, eq, inArray, or, isNull } from "drizzle-orm";

import { recordFeedback } from "./career-profile.js";
import { getDb } from "./db/client.js";
import { repo } from "./db/repo.js";
import {
  candidateRoles,
  companies,
  opportunities,
  opportunityEvidence,
  signals,
  type OpportunityStatus,
} from "./db/schema.js";

export const dispositionActions = [
  "saved",
  "dismissed",
  "pursuing",
  "not_interested",
] as const;
export type DispositionAction = (typeof dispositionActions)[number];

const dispositionToStatus: Record<DispositionAction, OpportunityStatus> = {
  saved: "discussed",
  dismissed: "dismissed",
  pursuing: "pursuing",
  not_interested: "dismissed",
};

export type OpportunityEvidenceView = {
  signalId: string;
  summary: string;
  type: string;
  direction: string;
  strength: number;
  observedAt: string;
  sourceUrl: string | null;
  excerpt: string | null;
  weight: number;
};

export type OpportunityCard = {
  id: string;
  headline: string;
  companyId: string;
  companyName: string;
  companyCategory: string | null;
  score: number;
  status: OpportunityStatus;
  disposition: DispositionAction | null;
  rationale: string | null;
  scoreVersion: string | null;
  freshnessDays: number | null;
  confidence: number | null;
  fit: number | null;
  risk: number | null;
  nextAction: string | null;
  roleTitle: string | null;
  roleLocation: string | null;
  roleKind: string | null;
  updatedAt: string;
  createdAt: string;
  evidenceCount: number;
};

export type OpportunityDetail = OpportunityCard & {
  evidence: OpportunityEvidenceView[];
  scoreInputs: Record<string, unknown>;
};

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24)));
}

function readNumber(
  inputs: Record<string, unknown>,
  key: string,
): number | null {
  const value = inputs[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inferDisposition(status: OpportunityStatus): DispositionAction | null {
  if (status === "pursuing") return "pursuing";
  if (status === "dismissed") return "dismissed";
  if (status === "discussed") return "saved";
  return null;
}

function nextActionFor(status: OpportunityStatus, roleTitle: string | null): string {
  if (status === "pursuing") {
    return "Draft outreach to a hiring manager or peer in seat.";
  }
  if (status === "discussed") {
    return "Review evidence and decide whether to pursue.";
  }
  if (status === "dismissed") {
    return "No action — marked not a fit.";
  }
  if (roleTitle) {
    return `Review ${roleTitle} evidence and set a disposition.`;
  }
  return "Open the opportunity and choose a next step.";
}

function toCard(row: {
  id: string;
  headline: string;
  companyId: string;
  companyName: string;
  companyCategory: string | null;
  score: number;
  status: OpportunityStatus;
  rationale: string | null;
  scoreVersion: string | null;
  scoreInputs: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
  roleTitle: string | null;
  roleLocation: string | null;
  roleKind: string | null;
  roleObservedAt: Date | string | null;
  roleConfidence: number | null;
  evidenceCount: number;
}): OpportunityCard {
  const inputs = row.scoreInputs ?? {};
  const timing = readNumber(inputs, "timing");
  const negativeDrag = readNumber(inputs, "negativeDrag");
  const freshnessDays = daysSince(
    row.roleObservedAt
      ? typeof row.roleObservedAt === "string"
        ? row.roleObservedAt
        : row.roleObservedAt.toISOString()
      : row.updatedAt,
  );

  return {
    id: row.id,
    headline: row.headline,
    companyId: row.companyId,
    companyName: row.companyName,
    companyCategory: row.companyCategory,
    score: row.score,
    status: row.status,
    disposition: inferDisposition(row.status),
    rationale: row.rationale,
    scoreVersion: row.scoreVersion,
    freshnessDays,
    confidence: row.roleConfidence,
    fit: timing ?? row.score,
    risk: negativeDrag,
    nextAction: nextActionFor(row.status, row.roleTitle),
    roleTitle: row.roleTitle,
    roleLocation: row.roleLocation,
    roleKind: row.roleKind,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    evidenceCount: row.evidenceCount,
  };
}

export async function listMemberOpportunities(
  memberId: string,
  options?: { status?: OpportunityStatus; limit?: number },
): Promise<OpportunityCard[]> {
  const db = getDb();
  const limit = options?.limit ?? 50;

  const conditions = [
    or(eq(opportunities.memberId, memberId), isNull(opportunities.memberId))!,
  ];
  if (options?.status) {
    conditions.push(eq(opportunities.status, options.status));
  }

  const rows = await db
    .select({
      id: opportunities.id,
      headline: opportunities.headline,
      companyId: opportunities.companyId,
      companyName: companies.name,
      companyCategory: companies.category,
      score: opportunities.score,
      status: opportunities.status,
      rationale: opportunities.rationale,
      scoreVersion: opportunities.scoreVersion,
      scoreInputs: opportunities.scoreInputs,
      updatedAt: opportunities.updatedAt,
      createdAt: opportunities.createdAt,
      roleTitle: candidateRoles.title,
      roleLocation: candidateRoles.location,
      roleKind: candidateRoles.kind,
      roleObservedAt: candidateRoles.observedAt,
      roleConfidence: candidateRoles.confidence,
    })
    .from(opportunities)
    .innerJoin(companies, eq(companies.id, opportunities.companyId))
    .leftJoin(
      candidateRoles,
      eq(candidateRoles.id, opportunities.candidateRoleId),
    )
    .where(and(...conditions))
    .orderBy(desc(opportunities.score), desc(opportunities.updatedAt))
    .limit(limit);

  const ids = rows.map((row) => row.id);
  const evidenceCounts = new Map<string, number>();
  if (ids.length > 0) {
    const evidenceRows = await db
      .select({
        opportunityId: opportunityEvidence.opportunityId,
      })
      .from(opportunityEvidence)
      .where(inArray(opportunityEvidence.opportunityId, ids));
    for (const row of evidenceRows) {
      evidenceCounts.set(
        row.opportunityId,
        (evidenceCounts.get(row.opportunityId) ?? 0) + 1,
      );
    }
  }

  return rows.map((row) =>
    toCard({
      ...row,
      scoreInputs: (row.scoreInputs ?? {}) as Record<string, unknown>,
      evidenceCount: evidenceCounts.get(row.id) ?? 0,
    }),
  );
}

export async function getMemberOpportunity(
  memberId: string,
  opportunityId: string,
): Promise<OpportunityDetail | null> {
  const cards = await listMemberOpportunities(memberId, { limit: 200 });
  const card = cards.find((item) => item.id === opportunityId);
  if (!card) return null;

  // Re-check ownership for member-private rows.
  const owned = await repo.listOpportunities({
    memberId,
    includeShared: true,
    limit: 200,
  });
  const raw = owned.find((item) => item.id === opportunityId);
  if (!raw) return null;

  const db = getDb();
  const evidenceRows = await db
    .select({
      signalId: signals.id,
      summary: signals.summary,
      type: signals.type,
      direction: signals.direction,
      strength: signals.strength,
      observedAt: signals.observedAt,
      sourceUrl: signals.sourceUrl,
      excerpt: signals.excerpt,
      weight: opportunityEvidence.weight,
    })
    .from(opportunityEvidence)
    .innerJoin(signals, eq(signals.id, opportunityEvidence.signalId))
    .where(eq(opportunityEvidence.opportunityId, opportunityId))
    .orderBy(desc(signals.observedAt));

  return {
    ...card,
    evidence: evidenceRows.map((row) => ({
      signalId: row.signalId,
      summary: row.summary,
      type: row.type,
      direction: row.direction,
      strength: row.strength,
      observedAt: row.observedAt,
      sourceUrl: row.sourceUrl,
      excerpt: row.excerpt,
      weight: row.weight,
    })),
    scoreInputs: (raw.scoreInputs ?? {}) as Record<string, unknown>,
  };
}

export async function setOpportunityDisposition(input: {
  memberId: string;
  opportunityId: string;
  disposition: DispositionAction;
}): Promise<OpportunityDetail | null> {
  const existing = await getMemberOpportunity(
    input.memberId,
    input.opportunityId,
  );
  if (!existing) return null;

  // Do not mutate shared seed rows owned by nobody — clone is out of scope;
  // only update member-owned opportunities.
  const owned = await repo.listOpportunities({
    memberId: input.memberId,
    includeShared: false,
    limit: 200,
  });
  const row = owned.find((item) => item.id === input.opportunityId);
  if (!row) {
    // Shared seed: record feedback only and return a virtual disposition view.
    await recordFeedback({
      memberId: input.memberId,
      kind: "opportunity_disposition",
      subjectType: "opportunity",
      subjectId: input.opportunityId,
      payload: {
        disposition: input.disposition,
        shared: true,
        previousStatus: existing.status,
      },
    });
    return {
      ...existing,
      disposition: input.disposition,
      status: dispositionToStatus[input.disposition],
      nextAction: nextActionFor(
        dispositionToStatus[input.disposition],
        existing.roleTitle,
      ),
    };
  }

  const nextStatus = dispositionToStatus[input.disposition];
  await repo.updateOpportunityStatus(input.opportunityId, nextStatus);
  await recordFeedback({
    memberId: input.memberId,
    kind: "opportunity_disposition",
    subjectType: "opportunity",
    subjectId: input.opportunityId,
    payload: {
      disposition: input.disposition,
      previousStatus: row.status,
      nextStatus,
    },
  });

  return getMemberOpportunity(input.memberId, input.opportunityId);
}
