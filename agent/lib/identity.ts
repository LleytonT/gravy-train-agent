/**
 * Identity module — resolves verified external principals to internal members.
 *
 * Only this module should know provider subject IDs (Clerk `user_*`, local-dev).
 * Feature modules and Eve tools accept only the internal `memberId`.
 */

import { eq } from "drizzle-orm";
import type { SessionAuthContext, SessionContext } from "eve/context";

import { getDb } from "./db/client.js";
import { members } from "./db/schema.js";

export const LOCAL_DEV_EXTERNAL_AUTH_ID = "local-dev";

export type ExternalAuthPrincipal = {
  externalAuthId: string;
  email?: string | null;
  displayName?: string | null;
};

export type MemberRecord = {
  id: string;
  externalAuthId: string | null;
  email: string | null;
  displayName: string | null;
};

function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function findMemberByExternalAuthId(
  externalAuthId: string,
): Promise<MemberRecord | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: members.id,
      externalAuthId: members.externalAuthId,
      email: members.email,
      displayName: members.displayName,
    })
    .from(members)
    .where(eq(members.externalAuthId, externalAuthId))
    .limit(1);
  return row ?? null;
}

/**
 * Upsert a member row for a verified external auth subject.
 * Never accepts a client-supplied member ID — only the provider subject.
 */
export async function upsertMemberFromExternalAuth(
  principal: ExternalAuthPrincipal,
): Promise<MemberRecord> {
  const externalAuthId = principal.externalAuthId.trim();
  if (!externalAuthId) {
    throw new Error("externalAuthId is required");
  }

  const email = normalizeOptional(principal.email);
  const displayName = normalizeOptional(principal.displayName);
  const db = getDb();
  const existing = await findMemberByExternalAuthId(externalAuthId);

  if (existing) {
    const nextEmail = email ?? existing.email;
    const nextDisplayName = displayName ?? existing.displayName;
    if (nextEmail === existing.email && nextDisplayName === existing.displayName) {
      return existing;
    }

    const [updated] = await db
      .update(members)
      .set({
        email: nextEmail,
        displayName: nextDisplayName,
        updatedAt: new Date(),
      })
      .where(eq(members.id, existing.id))
      .returning({
        id: members.id,
        externalAuthId: members.externalAuthId,
        email: members.email,
        displayName: members.displayName,
      });
    return updated!;
  }

  const [created] = await db
    .insert(members)
    .values({
      externalAuthId,
      email,
      displayName,
    })
    .returning({
      id: members.id,
      externalAuthId: members.externalAuthId,
      email: members.email,
      displayName: members.displayName,
    });
  return created!;
}

export function memberIdFromSessionAuth(
  auth: SessionAuthContext | null | undefined,
): string | null {
  const value = auth?.attributes?.memberId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Resolve the verified internal member for the active Eve turn.
 * Ignores any client-supplied member IDs in tool arguments.
 */
export function requireMemberCaller(ctx: SessionContext): {
  memberId: string;
  principalId: string;
} {
  const caller = ctx.session.auth.current;
  const memberId = memberIdFromSessionAuth(caller);

  if (caller?.principalType !== "user" || !memberId) {
    throw new Error(
      "An authenticated member is required. Sign in on the web app, or use local Eve development which maps to the local-dev member.",
    );
  }

  return { memberId, principalId: caller.principalId };
}
