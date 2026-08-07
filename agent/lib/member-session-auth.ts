/**
 * Eve AuthFn for Gravy Scout member session JWTs (Telegram Login primary).
 */

import { withAuthChallenges, type AuthFn } from "eve/channels/auth";
import type { SessionAuthContext } from "eve/context";

import { verifyMemberSessionToken } from "./member-session.js";
import { findMemberByExternalAuthId } from "./identity.js";

function extractBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  return token || null;
}

async function sessionFromToken(
  token: string,
): Promise<SessionAuthContext | null> {
  const claims = await verifyMemberSessionToken(token);
  if (!claims) return null;

  // Re-resolve member so revoked/deleted rows fail closed.
  const member = await findMemberByExternalAuthId(claims.externalAuthId);
  if (!member || member.id !== claims.memberId) return null;

  return {
    authenticator: claims.authenticator,
    issuer: "gravy-scout",
    principalId: claims.externalAuthId,
    principalType: "user",
    subject: claims.externalAuthId,
    attributes: {
      memberId: member.id,
      externalAuthId: claims.externalAuthId,
      ...(member.email ? { email: member.email } : {}),
      ...(member.displayName ? { displayName: member.displayName } : {}),
    },
  };
}

/**
 * Accepts Bearer member-session JWTs minted after Telegram Login (or local-dev).
 * Returns null when the token is absent/invalid so the Eve auth walk continues.
 */
export function memberSessionAuth(): AuthFn<Request> {
  return withAuthChallenges(async (request) => {
    const bearer = extractBearer(request);
    if (!bearer) return null;
    try {
      return await sessionFromToken(bearer);
    } catch (error) {
      console.warn(
        "[member-session-auth] verify failed:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }, [{ scheme: "Bearer" }]);
}
