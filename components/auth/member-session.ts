"use client";

import { MEMBER_SESSION_COOKIE } from "@/agent/lib/member-session";

/**
 * Read the httpOnly session cookie is impossible from JS — clients obtain a
 * short-lived bearer via /api/auth/token for Eve calls. Until then, ChatPanel
 * uses the same-origin cookie through a dedicated token endpoint.
 */

export async function fetchSessionStatus(): Promise<{
  authenticated: boolean;
  memberId?: string;
  displayName?: string | null;
  source?: string;
  authenticator?: string | null;
}> {
  const res = await fetch("/api/auth/session", { credentials: "include" });
  return (await res.json()) as {
    authenticated: boolean;
    memberId?: string;
    displayName?: string | null;
    source?: string;
    authenticator?: string | null;
  };
}

export async function fetchEveBearerToken(): Promise<string | null> {
  const res = await fetch("/api/auth/token", { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { token?: string | null };
  return data.token ?? null;
}

export async function signOutMemberSession(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
}

export { MEMBER_SESSION_COOKIE };
