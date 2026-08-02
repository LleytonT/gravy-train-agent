import { eveChannel } from "eve/channels/eve";
import {
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

/**
 * Local Eve TUI / loopback access maps to a stable internal member so tools
 * that require memberId keep working without Clerk during development.
 * Never use localDev alone in production.
 */
function localDevMemberAuth(): AuthFn<Request> {
  const base = localDev();
  return withAuthChallenges(async (request) => {
    const session = await base(request);
    if (!session) return null;

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
