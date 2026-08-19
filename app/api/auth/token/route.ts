import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  MEMBER_SESSION_COOKIE,
  signMemberSessionToken,
  verifyMemberSessionToken,
} from "@/agent/lib/member-session";
import { resolveAuthenticatedMember } from "@/lib/auth/member";

/**
 * Returns a Bearer token for Eve from the Telegram member-session cookie.
 */
export async function GET() {
  const jar = await cookies();
  const existing = jar.get(MEMBER_SESSION_COOKIE)?.value;
  if (existing && (await verifyMemberSessionToken(existing))) {
    return NextResponse.json({ token: existing });
  }

  const resolved = await resolveAuthenticatedMember();
  if (!resolved?.claims) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const token = await signMemberSessionToken(resolved.claims);
  const response = NextResponse.json({ token });
  response.cookies.set(MEMBER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
