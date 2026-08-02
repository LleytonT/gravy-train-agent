import { eveChannel } from "eve/channels/eve";
import {
  isLoopbackRequest,
  localDev,
  vercelOidc,
  withAuthChallenges,
  type AuthFn,
} from "eve/channels/auth";

import { clerkMemberAuth } from "../lib/clerk-auth.js";
import {
  LOCAL_DEV_EXTERNAL_AUTH_ID,
  upsertMemberFromExternalAuth,
} from "../lib/identity.js";

function hostLooksLoopback(request: Request): boolean {
  if (isLoopbackRequest(request)) return true;
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.split(",")[0]?.trim() ||
    "";
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * Local Eve TUI / loopback access maps to a stable internal member so tools
 * that require memberId keep working without Clerk during development.
 * Never use localDev alone in production.
 */
function localDevMemberAuth(): AuthFn<Request> {
  const base = localDev();
  return withAuthChallenges(async (request) => {
    const session =
      (await base(request)) ??
      (hostLooksLoopback(request)
        ? {
            attributes: {},
            authenticator: "local-dev",
            principalId: "local-dev",
            principalType: "local-dev",
          }
        : null);
    if (!session) return null;

    try {
      const member = await upsertMemberFromExternalAuth({
        externalAuthId: LOCAL_DEV_EXTERNAL_AUTH_ID,
        displayName: "Local Dev",
        email: null,
      });

      return {
        ...session,
        principalType: "user",
        attributes: {
          ...session.attributes,
          memberId: member.id,
          externalAuthId: LOCAL_DEV_EXTERNAL_AUTH_ID,
        },
      };
    } catch (error) {
      console.warn(
        "[eve-auth] local-dev member upsert failed:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }, [{ scheme: "Bearer" }]);
}

export default eveChannel({
  auth: [
    // Browser and same-origin web clients authenticated by Clerk.
    clerkMemberAuth(),
    // Vercel CLI / deployment-to-deployment callers.
    vercelOidc(),
    // Loopback Eve TUI and local REPL — explicit non-production fallback.
    localDevMemberAuth(),
  ],
});
