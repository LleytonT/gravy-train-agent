import { NextResponse, type NextRequest } from "next/server";

import {
  MEMBER_SESSION_COOKIE,
  verifyMemberSessionToken,
} from "@/agent/lib/member-session";

function pathOf(req: NextRequest): string {
  return req.nextUrl.pathname;
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return (
    pathname.startsWith("/how-it-works") ||
    pathname.startsWith("/get-started") ||
    pathname === "/eve/v1/health" ||
    pathname === "/api/messaging-config" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/onboarding/preview" ||
    pathname === "/api/inbound/resend"
  );
}

function isAppShellPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

async function hasMemberSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(MEMBER_SESSION_COOKIE)?.value;
  if (!token) return false;
  return Boolean(await verifyMemberSessionToken(token));
}

export default async function middleware(req: NextRequest) {
  const pathname = pathOf(req);
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (isAppShellPath(pathname)) {
    if (await hasMemberSession(req)) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = "/get-started";
    url.searchParams.set("verify", "1");
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Protected APIs fail closed in their handlers via requireAuthenticatedMember().
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
