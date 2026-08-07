#!/usr/bin/env npx tsx
import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

const { ensureSchema, getDb } = await import("../agent/lib/db/client.js");
const { repo } = await import("../agent/lib/db/repo.js");
const {
  careerProfiles,
  candidateRoles,
  companies,
  conversations,
  members,
  messages,
  opportunities,
  opportunityEvidence,
  signalSources,
  signals,
  sourceItems,
} = await import("../agent/lib/db/schema.js");

async function main() {
  await ensureSchema();
  const db = getDb();
  const runId = randomUUID();
  const companyId = `smoke-${runId}`;
  const timestamp = new Date().toISOString();
  let memberIds: string[] = [];

  try {
    const createdMembers = await db
      .insert(members)
      .values([
        {
          externalAuthId: `smoke-a-${runId}`,
          email: `smoke-a-${runId}@example.invalid`,
          displayName: "Smoke Member A",
        },
        {
          externalAuthId: `smoke-b-${runId}`,
          email: `smoke-b-${runId}@example.invalid`,
          displayName: "Smoke Member B",
        },
      ])
      .returning({ id: members.id });

    memberIds = createdMembers.map(({ id }) => id);
    const [memberA, memberB] = memberIds;
    if (!memberA || !memberB) {
      throw new Error("Expected two members to be created");
    }

    await db.insert(companies).values({
      id: companyId,
      name: `Smoke Company ${runId}`,
      aliases: "[]",
      watchlistTier: "warm",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await db.insert(careerProfiles).values([
      {
        memberId: memberA,
        currentTitle: "Solutions Engineer",
        profile: { interests: ["developer tools"] },
      },
      {
        memberId: memberB,
        currentTitle: "Account Executive",
        profile: { interests: ["AI infrastructure"] },
      },
    ]);

    const createdConversations = await db
      .insert(conversations)
      .values([
        { memberId: memberA, title: "Member A conversation" },
        { memberId: memberB, title: "Member B conversation" },
      ])
      .returning({
        id: conversations.id,
        memberId: conversations.memberId,
      });
    const conversationA = createdConversations.find(
      (conversation) => conversation.memberId === memberA,
    );
    if (!conversationA) {
      throw new Error("Expected member A conversation");
    }

    let rejectedCrossMemberMessage = false;
    try {
      await db.insert(messages).values({
        conversationId: conversationA.id,
        memberId: memberB,
        role: "member",
        surface: "web",
        body: "This relationship must be rejected",
        idempotencyKey: `smoke-cross-member-${runId}`,
      });
    } catch {
      rejectedCrossMemberMessage = true;
    }
    if (!rejectedCrossMemberMessage) {
      throw new Error("Database accepted a cross-member conversation message");
    }

    const [privateSource] = await db
      .insert(sourceItems)
      .values({
        memberId: memberA,
        sourceType: "smoke",
        visibility: "member",
        contentHash: `smoke-private-${runId}`,
        excerpt: "Private member A source",
      })
      .returning({ id: sourceItems.id });
    if (!privateSource) {
      throw new Error("Expected private source item");
    }

    const memberBSignal = await repo.saveSignal({
      memberId: memberB,
      companyId,
      type: "smoke",
      direction: "positive",
      strength: 1,
      summary: "Must not link to member A private evidence",
    });

    let rejectedCrossMemberSignal = false;
    try {
      await db.insert(signalSources).values({
        signalId: memberBSignal.id,
        sourceItemId: privateSource.id,
      });
    } catch {
      rejectedCrossMemberSignal = true;
    }
    if (!rejectedCrossMemberSignal) {
      throw new Error("Database accepted cross-member signal evidence");
    }

    const memberASignal = await repo.saveSignal({
      memberId: memberA,
      companyId,
      type: "smoke",
      direction: "positive",
      strength: 1,
      summary: "Member A private evidence",
    });
    await db.insert(signalSources).values({
      signalId: memberASignal.id,
      sourceItemId: privateSource.id,
    });

    let rejectedSignalOwnerChange = false;
    try {
      await db
        .update(signals)
        .set({ memberId: memberB })
        .where(eq(signals.id, memberASignal.id));
    } catch {
      rejectedSignalOwnerChange = true;
    }
    if (!rejectedSignalOwnerChange) {
      throw new Error("Database allowed private signal ownership to change");
    }

    let rejectedCrossMemberCandidate = false;
    try {
      await db.insert(candidateRoles).values({
        memberId: memberB,
        companyId,
        sourceItemId: privateSource.id,
        title: "Cross-member candidate",
        kind: "advertised",
      });
    } catch {
      rejectedCrossMemberCandidate = true;
    }
    if (!rejectedCrossMemberCandidate) {
      throw new Error("Database accepted cross-member candidate evidence");
    }

    const opportunityA = await repo.createOpportunity({
      memberId: memberA,
      companyId,
      headline: "Member A opportunity",
      score: 7.1,
    });
    await repo.createOpportunity({
      memberId: memberB,
      companyId,
      headline: "Member B opportunity",
      score: 8.2,
    });

    let rejectedCrossMemberOpportunityEvidence = false;
    try {
      await db.insert(opportunityEvidence).values({
        opportunityId: opportunityA.id,
        signalId: memberBSignal.id,
      });
    } catch {
      rejectedCrossMemberOpportunityEvidence = true;
    }
    if (!rejectedCrossMemberOpportunityEvidence) {
      throw new Error("Database accepted cross-member opportunity evidence");
    }

    const [profilesA, profilesB, conversationsA, conversationsB, opportunitiesA, opportunitiesB, repositoryA, repositoryB, unscoped] =
      await Promise.all([
        db.select().from(careerProfiles).where(eq(careerProfiles.memberId, memberA)),
        db.select().from(careerProfiles).where(eq(careerProfiles.memberId, memberB)),
        db.select().from(conversations).where(eq(conversations.memberId, memberA)),
        db.select().from(conversations).where(eq(conversations.memberId, memberB)),
        db.select().from(opportunities).where(eq(opportunities.memberId, memberA)),
        db.select().from(opportunities).where(eq(opportunities.memberId, memberB)),
        repo.listOpportunities({ memberId: memberA }),
        repo.listOpportunities({ memberId: memberB }),
        repo.listOpportunities(),
      ]);

    const counts = [
      profilesA.length,
      profilesB.length,
      conversationsA.length,
      conversationsB.length,
      opportunitiesA.length,
      opportunitiesB.length,
    ];
    if (counts.some((count) => count !== 1)) {
      throw new Error(`Member isolation failed; observed counts ${counts.join(", ")}`);
    }
    if (opportunitiesA[0]?.headline === opportunitiesB[0]?.headline) {
      throw new Error("Members unexpectedly share the same opportunity");
    }
    if (
      repositoryA.length !== 1 ||
      repositoryA[0]?.memberId !== memberA ||
      repositoryB.length !== 1 ||
      repositoryB[0]?.memberId !== memberB
    ) {
      throw new Error("Repository member filters did not enforce ownership");
    }
    if (unscoped.some((opportunity) => opportunity.memberId !== null)) {
      throw new Error("Unscoped repository read leaked a member opportunity");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          members: 2,
          profilesPerMember: [profilesA.length, profilesB.length],
          conversationsPerMember: [conversationsA.length, conversationsB.length],
          opportunitiesPerMember: [opportunitiesA.length, opportunitiesB.length],
          crossMemberRelationshipRejected: rejectedCrossMemberMessage,
          crossMemberSignalRejected: rejectedCrossMemberSignal,
          crossMemberCandidateRejected: rejectedCrossMemberCandidate,
          signalOwnerChangeRejected: rejectedSignalOwnerChange,
          crossMemberOpportunityEvidenceRejected:
            rejectedCrossMemberOpportunityEvidence,
        },
        null,
        2,
      ),
    );
  } finally {
    if (memberIds.length > 0) {
      await db.delete(members).where(inArray(members.id, memberIds));
    }
    await db.delete(companies).where(eq(companies.id, companyId));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
