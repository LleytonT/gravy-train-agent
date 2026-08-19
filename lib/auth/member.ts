import { cookies } from "next/headers";

import {
  findMemberByExternalAuthId,
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
  source: "telegram-session" | "local-dev-session";
};

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

/**
 * Resolve the signed-in principal to an internal member.
 * Web uses the Telegram-minted member-session cookie. Never trusts
 * client-supplied member IDs.
 */
export async function resolveAuthenticatedMember(): Promise<ResolvedMemberSession | null> {
  return memberFromSessionCookie();
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
