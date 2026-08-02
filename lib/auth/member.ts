import { auth, currentUser } from "@clerk/nextjs/server";

import {
  upsertMemberFromExternalAuth,
  type MemberRecord,
} from "@/agent/lib/identity";

export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Resolve the signed-in Clerk user to an internal member row.
 * Upserts on first authenticated request. Never trusts client member IDs.
 */
export async function requireAuthenticatedMember(): Promise<MemberRecord> {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    throw new UnauthorizedError();
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;
  const joinedName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const displayName =
    user?.fullName ?? (joinedName || null) ?? user?.username ?? null;

  return upsertMemberFromExternalAuth({
    externalAuthId: userId,
    email,
    displayName,
  });
}
