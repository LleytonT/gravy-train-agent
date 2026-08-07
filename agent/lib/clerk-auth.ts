/**
 * Clerk → Eve SessionAuthContext adapter.
 * Verifies session cookies or Bearer tokens without trusting client member IDs.
 */

import { createClerkClient, verifyToken } from "@clerk/backend";
import { withAuthChallenges, type AuthFn } from "eve/channels/auth";
import type { SessionAuthContext } from "eve/context";

import { upsertMemberFromExternalAuth } from "./identity.js";

function clerkKeys(): { secretKey: string; publishableKey: string } | null {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (!secretKey || !publishableKey) return null;
  return { secretKey, publishableKey };
}

/**
 * Only apply azp allowlisting when explicitly configured.
 * Defaulting to localhost parties rejects real Clerk session JWTs whose `azp`
 * is the Clerk Frontend API origin — which produced Eve 401s on chat start.
 */
function authorizedParties(): string[] | undefined {
  const configured = process.env.CLERK_AUTHORIZED_PARTIES?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured?.length ? configured : undefined;
}

function claimString(
  claims: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = claims?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  return token || null;
}

async function memberSessionFromUserId(
  userId: string,
  claims: Record<string, unknown> | null,
): Promise<SessionAuthContext> {
  const email =
    claimString(claims, "email") ??
    claimString(claims, "email_address") ??
    null;
  const joinedName = [
    claimString(claims, "first_name"),
    claimString(claims, "last_name"),
  ]
    .filter(Boolean)
    .join(" ");
  const displayName =
    claimString(claims, "name") ??
    claimString(claims, "full_name") ??
    (joinedName || null);

  const member = await upsertMemberFromExternalAuth({
    externalAuthId: userId,
    email,
    displayName,
  });

  return {
    authenticator: "clerk",
    issuer: "https://clerk.com",
    principalId: userId,
    principalType: "user",
    subject: userId,
    attributes: {
      memberId: member.id,
      externalAuthId: userId,
      ...(email ? { email } : {}),
    },
  };
}

async function authenticateViaBearer(
  token: string,
  keys: { secretKey: string; publishableKey: string },
): Promise<SessionAuthContext | null> {
  try {
    const payload = await verifyToken(token, {
      secretKey: keys.secretKey,
      ...(authorizedParties()
        ? { authorizedParties: authorizedParties() }
        : {}),
    });
    const userId =
      typeof payload.sub === "string" && payload.sub.startsWith("user_")
        ? payload.sub
        : null;
    if (!userId) return null;
    return memberSessionFromUserId(
      userId,
      payload as unknown as Record<string, unknown>,
    );
  } catch (error) {
    console.warn(
      "[clerk-auth] verifyToken failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function authenticateViaRequestState(
  request: Request,
  keys: { secretKey: string; publishableKey: string },
): Promise<SessionAuthContext | null> {
  const clerk = createClerkClient(keys);
  const options = {
    publishableKey: keys.publishableKey,
    secretKey: keys.secretKey,
    ...(authorizedParties()
      ? { authorizedParties: authorizedParties() }
      : {}),
  };

  // Prefer cookie-only when a Bearer is present but may be non-Clerk/OIDC —
  // authenticateRequest treats Authorization as authoritative and ignores cookies.
  const attempts: Request[] = [request];
  if (extractBearer(request)) {
    const headers = new Headers(request.headers);
    headers.delete("authorization");
    attempts.push(
      new Request(request.url, {
        method: request.method,
        headers,
      }),
    );
  }

  for (const candidate of attempts) {
    const state = await clerk.authenticateRequest(candidate, options);
    if (!state.isAuthenticated) continue;
    const auth = state.toAuth();
    if (!auth.userId) continue;
    return memberSessionFromUserId(
      auth.userId,
      (auth.sessionClaims ?? null) as Record<string, unknown> | null,
    );
  }
  return null;
}

async function sessionAuthFromClerkRequest(
  request: Request,
): Promise<SessionAuthContext | null> {
  const keys = clerkKeys();
  if (!keys) return null;

  const bearer = extractBearer(request);
  if (bearer) {
    const fromBearer = await authenticateViaBearer(bearer, keys);
    if (fromBearer) return fromBearer;
  }

  return authenticateViaRequestState(request, keys);
}

/**
 * Eve AuthFn that accepts Clerk session cookies or Bearer session JWTs.
 * Returns null when Clerk is unconfigured or the request is unauthenticated
 * so the auth walk can fall through to vercelOidc / localDev.
 */
export function clerkMemberAuth(): AuthFn<Request> {
  return withAuthChallenges(async (request) => {
    try {
      return await sessionAuthFromClerkRequest(request);
    } catch (error) {
      console.warn(
        "[clerk-auth] authenticateRequest failed:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }, [{ scheme: "Bearer" }]);
}
