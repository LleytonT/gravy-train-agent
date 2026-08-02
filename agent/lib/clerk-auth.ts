/**
 * Clerk → Eve SessionAuthContext adapter.
 * Verifies session cookies or Bearer tokens without trusting client member IDs.
 */

import { createClerkClient } from "@clerk/backend";
import { withAuthChallenges, type AuthFn } from "eve/channels/auth";
import type { SessionAuthContext } from "eve/context";

import { upsertMemberFromExternalAuth } from "./identity.js";

function clerkKeys(): { secretKey: string; publishableKey: string } | null {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (!secretKey || !publishableKey) return null;
  return { secretKey, publishableKey };
}

function authorizedParties(): string[] | undefined {
  const configured = process.env.CLERK_AUTHORIZED_PARTIES?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured?.length) return configured;

  const vercelUrl = process.env.VERCEL_URL?.trim();
  const parties = new Set<string>();
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    parties.add(process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, ""));
  }
  if (vercelUrl) {
    parties.add(`https://${vercelUrl.replace(/^https?:\/\//, "")}`);
  }
  // Local Next / Eve loopback hosts used in development.
  parties.add("http://localhost:3000");
  parties.add("http://127.0.0.1:3000");
  return [...parties];
}

function claimString(
  claims: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = claims?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function sessionAuthFromClerkRequest(
  request: Request,
): Promise<SessionAuthContext | null> {
  const keys = clerkKeys();
  if (!keys) return null;

  const clerk = createClerkClient(keys);
  const state = await clerk.authenticateRequest(request, {
    publishableKey: keys.publishableKey,
    secretKey: keys.secretKey,
    authorizedParties: authorizedParties(),
  });

  if (!state.isAuthenticated) return null;

  const auth = state.toAuth();
  const userId = auth.userId;
  if (!userId) return null;

  const claims = (auth.sessionClaims ?? null) as Record<string, unknown> | null;
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
