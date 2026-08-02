import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import {
  getMemberContextSnapshot,
  scoringPrefsFromSnapshot,
} from "../career-profile.js";
import { getDb } from "../db/client.js";
import { repo } from "../db/repo.js";
import {
  candidateRoles,
  opportunities,
  opportunityEvidence,
  signals,
} from "../db/schema.js";
import { scoreCompany } from "../scoring.js";
import { analyzeFit } from "./analysts/fit.js";
import { SCORE_VERSION } from "./types.js";

export type OpportunityUpsertResult = {
  opportunityId: string;
  memberId: string;
  created: boolean;
  materialChanged: boolean;
  excludedByConstraint: boolean;
};

function materialHash(input: {
  candidateRoleId: string;
  score: number;
  status: string;
  rationale: string;
}): string {
  return createHash("sha256")
    .update(
      `${input.candidateRoleId}|${input.score.toFixed(2)}|${input.status}|${input.rationale}`,
    )
    .digest("hex")
    .slice(0, 32);
}

export async function upsertOpportunitiesForMembers(input: {
  memberIds: string[];
  /** Company ids touched in this run — used to scope candidates. */
  companyIds: string[];
}): Promise<OpportunityUpsertResult[]> {
  const results: OpportunityUpsertResult[] = [];
  if (input.memberIds.length === 0) return results;

  const db = getDb();
  for (const memberId of input.memberIds) {
    const snapshot = await getMemberContextSnapshot(memberId);
    const prefs = scoringPrefsFromSnapshot(snapshot);

    const roleConditions = [
      eq(candidateRoles.memberId, memberId),
      eq(candidateRoles.status, "active"),
    ];
    const roles =
      input.companyIds.length > 0
        ? await db
            .select()
            .from(candidateRoles)
            .where(
              and(
                ...roleConditions,
                inArray(candidateRoles.companyId, input.companyIds),
              ),
            )
        : await db
            .select()
            .from(candidateRoles)
            .where(and(...roleConditions));

    for (const role of roles) {
      const company = await repo.getCompanyById(role.companyId);
      if (!company || company.watchlistTier === "ignore") continue;

      const companySignals = await db
        .select()
        .from(signals)
        .where(
          and(
            eq(signals.companyId, role.companyId),
            // member-private or shared
          ),
        );

      const usableSignals = companySignals.filter(
        (signal) => !signal.memberId || signal.memberId === memberId,
      );

      const scored = scoreCompany(usableSignals, {
        ...prefs,
        watchlistTier: company.watchlistTier,
        companyCategory: company.category,
        companyName: company.name,
      });

      const fit = analyzeFit({
        roleTitle: role.title,
        roleLocation: role.location,
        companyName: company.name,
        companyScore: scored,
        signalIds: usableSignals.map((s) => s.id),
        signalSummaries: usableSignals.map((s) => s.summary),
        constraints: snapshot.document.constraints,
        targetTitles: snapshot.document.goals?.targetTitles,
      });

      if (!fit.eligible) {
        results.push({
          opportunityId: "",
          memberId,
          created: false,
          materialChanged: false,
          excludedByConstraint: true,
        });
        continue;
      }

      if (scored.pingTier === "none") continue;

      const headline = `[${role.kind}] ${role.title} @ ${company.name}`;
      const hash = materialHash({
        candidateRoleId: role.id,
        score: scored.score,
        status: "new",
        rationale: fit.rationale,
      });

      const [existing] = await db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.memberId, memberId),
            eq(opportunities.candidateRoleId, role.id),
          ),
        )
        .limit(1);

      const scoreInputs = {
        timing: scored.timing,
        territory: scored.territory,
        talent: scored.talent,
        negativeDrag: scored.negativeDrag,
        pingTier: scored.pingTier,
        roleKind: role.kind,
        signalIds: fit.citedSignalIds,
        prefs,
      };

      if (existing) {
        const materialChanged = existing.materialHash !== hash;
        await db
          .update(opportunities)
          .set({
            headline,
            score: scored.score,
            scoreVersion: SCORE_VERSION,
            scoreInputs,
            rationale: fit.rationale,
            materialHash: hash,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(opportunities.id, existing.id));

        for (const signalId of fit.citedSignalIds) {
          await db
            .insert(opportunityEvidence)
            .values({
              opportunityId: existing.id,
              signalId,
              weight: 1,
            })
            .onConflictDoNothing();
        }

        results.push({
          opportunityId: existing.id,
          memberId,
          created: false,
          materialChanged,
          excludedByConstraint: false,
        });
        continue;
      }

      const recent = await repo.getRecentPingForCompany(
        role.companyId,
        48,
        memberId,
      );
      if (recent) {
        // Still upsert evidence onto a digest-bound opportunity if same role absent.
        continue;
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      await db.insert(opportunities).values({
        id,
        memberId,
        companyId: role.companyId,
        candidateRoleId: role.id,
        headline,
        score: scored.score,
        scoreVersion: SCORE_VERSION,
        scoreInputs,
        rationale: fit.rationale,
        materialHash: hash,
        status: "new",
        pingedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      for (const signalId of fit.citedSignalIds) {
        await db
          .insert(opportunityEvidence)
          .values({
            opportunityId: id,
            signalId,
            weight: 1,
          })
          .onConflictDoNothing();
      }

      results.push({
        opportunityId: id,
        memberId,
        created: true,
        materialChanged: true,
        excludedByConstraint: false,
      });
    }
  }

  return results;
}
