import { cookies } from "next/headers";

import {
  findMemberByExternalAuthId,
  upsertMemberFromExternalAuth,
  type MemberRecord,
} from "@/agent/lib/identity";
import {
  MEMBER_SESSION_COOKIE,
  verifyMemberSessionToken,
  type MemberSessionClaims,
} from "@/agent/lib/member-session";

export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type ResolvedMemberSession = {
  member: MemberRecord;
  claims: MemberSessionClaims | null;
  source: "telegram-session" | "clerk" | "local-dev-session";
};

const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY?.trim() &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
);

async function memberFromSessionCookie(): Promise<ResolvedMemberSession | null> {
  const jar = await cookies();
  const token = jar.get(MEMBER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyMemberSessionToken(token);
  if (!claims) return null;

  const member = await findMemberByExternalAuthId(claims.externalAuthId);
  if (!member || member.id !== claims.memberId) return null;

  return {
    member,
    claims,
    source:
      claims.authenticator === "local-dev"
        ? "local-dev-session"
        : "telegram-session",
  };
}

async function memberFromClerk(): Promise<ResolvedMemberSession | null> {
  if (!clerkConfigured) return null;

  try {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const { userId, isAuthenticated } = await auth();
    if (!isAuthenticated || !userId) return null;

    const user = await currentUser();
    const email =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses[0]?.emailAddress ??
      null;
    const joinedName = [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(" ");
    const displayName =
      user?.fullName ?? (joinedName || null) ?? user?.username ?? null;

    const member = await upsertMemberFromExternalAuth({
      externalAuthId: userId,
      email,
      displayName,
    });

    return {
      member,
      claims: {
        memberId: member.id,
        externalAuthId: userId,
        authenticator: "clerk",
        displayName,
      },
      source: "clerk",
    };
  } catch (error) {
    console.warn(
      "[auth] Clerk resolve failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Resolve the signed-in principal to an internal member.
 * Preference order: Gravy Scout member session (Telegram Login) → Clerk.
 * Never trusts client-supplied member IDs.
 */
export async function resolveAuthenticatedMember(): Promise<ResolvedMemberSession | null> {
  return (await memberFromSessionCookie()) ?? (await memberFromClerk());
}

export async function requireAuthenticatedMember(): Promise<MemberRecord> {
  const resolved = await resolveAuthenticatedMember();
  if (!resolved) {
    throw new UnauthorizedError();
  }
  return resolved.member;
}

export async function getMemberSessionBearerToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(MEMBER_SESSION_COOKIE)?.value ?? null;
}
