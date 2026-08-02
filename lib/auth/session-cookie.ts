import { MEMBER_SESSION_COOKIE, MEMBER_SESSION_TTL_SECONDS } from "@/agent/lib/member-session";

export function memberSessionCookieOptions(maxAge = MEMBER_SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export { MEMBER_SESSION_COOKIE };
