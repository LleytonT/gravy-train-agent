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
  FIXTURE_MEMBER_ID,
  isEvalFixture,
} from "../lib/eval-fixture/index.js";
import {
  LOCAL_DEV_EXTERNAL_AUTH_ID,
  upsertMemberFromExternalAuth,
} from "../lib/identity.js";
import { memberSessionAuth } from "../lib/member-session-auth.js";

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

    // Fixture evals must not require Neon — map loopback to a stable member.
    if (isEvalFixture()) {
      return {
        ...session,
        principalType: "user",
        attributes: {
          ...session.attributes,
          memberId: FIXTURE_MEMBER_ID,
          externalAuthId: LOCAL_DEV_EXTERNAL_AUTH_ID,
        },
      };
    }

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
    // Telegram Login (primary web) and other minted member-session JWTs.
    memberSessionAuth(),
    // Optional Clerk sessions for members who prefer email sign-in.
    clerkMemberAuth(),
    // Vercel CLI / deployment-to-deployment callers.
    vercelOidc(),
    // Loopback Eve TUI and local REPL — explicit non-production fallback.
    localDevMemberAuth(),
  ],
});
