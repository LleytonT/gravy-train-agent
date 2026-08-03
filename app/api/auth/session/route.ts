import { NextResponse } from "next/server";

import {
  LOCAL_DEV_EXTERNAL_AUTH_ID,
  upsertMemberFromExternalAuth,
} from "@/agent/lib/identity";
import { signMemberSessionToken } from "@/agent/lib/member-session";
import {
  resolveAuthenticatedMember,
} from "@/lib/auth/member";
import {
  MEMBER_SESSION_COOKIE,
  memberSessionCookieOptions,
} from "@/lib/auth/session-cookie";

function isLoopbackHost(request: Request): boolean {
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

export async function GET() {
  const resolved = await resolveAuthenticatedMember();
  if (!resolved) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    memberId: resolved.member.id,
    displayName: resolved.member.displayName,
    email: resolved.member.email,
    source: resolved.source,
    authenticator: resolved.claims?.authenticator ?? null,
  });
}

/**
 * Local-only: mint a member session for browser demos without Telegram/Clerk.
 * Rejected off loopback and in production.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || !isLoopbackHost(request)) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let intent: "local-dev" | "clerk-bridge" = "local-dev";
  try {
    const body = (await request.json()) as { intent?: string };
    if (body.intent === "clerk-bridge") intent = "clerk-bridge";
  } catch {
    /* empty body is fine */
  }

  if (intent === "clerk-bridge") {
    const resolved = await resolveAuthenticatedMember();
    if (!resolved || resolved.source !== "clerk" || !resolved.claims) {
      return NextResponse.json(
        { error: "Clerk session required to bridge" },
        { status: 401 },
      );
    }
    const token = await signMemberSessionToken(resolved.claims);
    const response = NextResponse.json({
      ok: true,
      memberId: resolved.member.id,
      authenticator: "clerk",
    });
    response.cookies.set(
      MEMBER_SESSION_COOKIE,
      token,
      memberSessionCookieOptions(),
    );
    return response;
  }

  const member = await upsertMemberFromExternalAuth({
    externalAuthId: LOCAL_DEV_EXTERNAL_AUTH_ID,
    displayName: "Local Dev",
    email: null,
  });
  const token = await signMemberSessionToken({
    memberId: member.id,
    externalAuthId: LOCAL_DEV_EXTERNAL_AUTH_ID,
    authenticator: "local-dev",
    displayName: member.displayName,
  });
  const response = NextResponse.json({
    ok: true,
    memberId: member.id,
    authenticator: "local-dev",
  });
  response.cookies.set(
    MEMBER_SESSION_COOKIE,
    token,
    memberSessionCookieOptions(),
  );
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(MEMBER_SESSION_COOKIE, "", memberSessionCookieOptions(0));
  return response;
}
