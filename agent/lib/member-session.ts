/**
 * Gravy Scout member session tokens — minted after Telegram Login (web)
 * or local-dev. Telegram chat uses the webhook principal, not this JWT.
 */

import { createHash, randomBytes } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import { MEMBER_SESSION_TTL_SECONDS } from "./member-session-constants.js";

export {
  MEMBER_SESSION_COOKIE,
  MEMBER_SESSION_TTL_SECONDS,
} from "./member-session-constants.js";

export type MemberSessionClaims = {
  memberId: string;
  externalAuthId: string;
  authenticator: "telegram" | "local-dev";
  displayName?: string | null;
};

function sessionSecretKey(): Uint8Array {
  const configured =
    process.env.MEMBER_SESSION_SECRET?.trim() ||
    process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!configured) {
    // Deterministic local fallback so typecheck/smoke can import the module;
    // production requests must set a real secret (Telegram bot token is fine).
    const fallback = createHash("sha256")
      .update("gravy-scout-dev-member-session")
      .digest();
    return new Uint8Array(fallback);
  }
  return new Uint8Array(createHash("sha256").update(configured).digest());
}

export function isMemberSessionSigningConfigured(): boolean {
  return Boolean(
    process.env.MEMBER_SESSION_SECRET?.trim() ||
      process.env.TELEGRAM_BOT_TOKEN?.trim(),
  );
}

export async function signMemberSessionToken(
  claims: MemberSessionClaims,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    memberId: claims.memberId,
    externalAuthId: claims.externalAuthId,
    authenticator: claims.authenticator,
    ...(claims.displayName ? { displayName: claims.displayName } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.externalAuthId)
    .setIssuedAt(now)
    .setExpirationTime(now + MEMBER_SESSION_TTL_SECONDS)
    .setJti(randomBytes(12).toString("base64url"))
    .sign(sessionSecretKey());
}

export async function verifyMemberSessionToken(
  token: string,
): Promise<MemberSessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey(), {
      algorithms: ["HS256"],
    });
    const memberId =
      typeof payload.memberId === "string" ? payload.memberId : null;
    const externalAuthId =
      typeof payload.externalAuthId === "string"
        ? payload.externalAuthId
        : typeof payload.sub === "string"
          ? payload.sub
          : null;
    const authenticator = payload.authenticator;
    if (
      !memberId ||
      !externalAuthId ||
      (authenticator !== "telegram" && authenticator !== "local-dev")
    ) {
      return null;
    }
    return {
      memberId,
      externalAuthId,
      authenticator,
      displayName:
        typeof payload.displayName === "string" ? payload.displayName : null,
    };
  } catch {
    return null;
  }
}
