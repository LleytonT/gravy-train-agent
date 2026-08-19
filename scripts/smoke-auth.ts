#!/usr/bin/env npx tsx
/**
 * GS-002 smoke checks for identity resolution and anonymous auth removal.
 * Does not require a running Next server.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { inArray } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

const { ensureSchema, getDb } = await import("../agent/lib/db/client.js");
const {
  LOCAL_DEV_EXTERNAL_AUTH_ID,
  memberIdFromSessionAuth,
  requireMemberCaller,
  upsertMemberFromExternalAuth,
} = await import("../agent/lib/identity.js");
const { members, careerProfiles } = await import("../agent/lib/db/schema.js");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const eveChannel = readFileSync(
    resolve("agent/channels/eve.ts"),
    "utf8",
  );
  assert(!/\bnone\s*\(/.test(eveChannel), "Eve channel still admits none()");
  assert(
    eveChannel.includes("memberSessionAuth"),
    "Eve channel missing memberSessionAuth() for Telegram Login sessions",
  );
  assert(
    !eveChannel.includes("clerkMemberAuth"),
    "Eve channel must not include Clerk auth",
  );
  assert(
    eveChannel.includes("localDevMemberAuth") ||
      eveChannel.includes("localDev"),
    "Eve channel missing local development auth",
  );

  const proxy = readFileSync(resolve("proxy.ts"), "utf8");
  assert(!proxy.includes("clerkMiddleware"), "proxy.ts must not use Clerk");
  assert(
    proxy.includes("hasMemberSession"),
    "proxy.ts must protect the app shell via member session",
  );
  assert(
    proxy.includes("/get-started"),
    "proxy.ts must keep progressive onboarding public",
  );

  await ensureSchema();
  const db = getDb();
  const runId = randomUUID();
  const memberIds: string[] = [];

  try {
    const memberA = await upsertMemberFromExternalAuth({
      externalAuthId: `telegram_smoke_a_${runId}`,
      email: `a-${runId}@example.invalid`,
      displayName: "Smoke A",
    });
    const memberAAgain = await upsertMemberFromExternalAuth({
      externalAuthId: `telegram_smoke_a_${runId}`,
      email: `a-${runId}@example.invalid`,
      displayName: "Smoke A Updated",
    });
    assert(memberA.id === memberAAgain.id, "upsert must be idempotent by subject");
    assert(
      memberAAgain.displayName === "Smoke A Updated",
      "upsert should refresh display name",
    );

    const memberB = await upsertMemberFromExternalAuth({
      externalAuthId: `telegram_smoke_b_${runId}`,
      email: `b-${runId}@example.invalid`,
      displayName: "Smoke B",
    });
    assert(memberA.id !== memberB.id, "distinct subjects must get distinct members");
    memberIds.push(memberA.id, memberB.id);

    const forged = memberIdFromSessionAuth({
      authenticator: "client",
      principalId: "forged",
      principalType: "user",
      attributes: { memberId: memberB.id },
    });
    assert(forged === memberB.id, "helper reads attributes.memberId");

    // Client-supplied IDs never enter upsert — only externalAuthId does.
    const local = await upsertMemberFromExternalAuth({
      externalAuthId: `${LOCAL_DEV_EXTERNAL_AUTH_ID}-smoke-${runId}`,
      displayName: "Local smoke",
    });
    memberIds.push(local.id);

    let threw = false;
    try {
      requireMemberCaller({
        session: {
          auth: {
            current: {
              authenticator: "none",
              principalId: "anon",
              principalType: "anonymous",
              attributes: {},
            },
            initiator: null,
          },
        },
      } as never);
    } catch {
      threw = true;
    }
    assert(threw, "requireMemberCaller must reject anonymous principals");

    requireMemberCaller({
      session: {
        auth: {
          current: {
            authenticator: "telegram",
            principalId: "user_smoke",
            principalType: "user",
            attributes: { memberId: memberA.id },
          },
          initiator: null,
        },
      },
    } as never);

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: [
            "eve channel rejects anonymous none()",
            "proxy protects non-public routes",
            "external auth upserts are idempotent",
            "members are isolated by subject",
            "requireMemberCaller enforces member attributes",
          ],
          members: memberIds.length,
        },
        null,
        2,
      ),
    );
  } finally {
    if (memberIds.length) {
      await db
        .delete(careerProfiles)
        .where(inArray(careerProfiles.memberId, memberIds));
      await db.delete(members).where(inArray(members.id, memberIds));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
