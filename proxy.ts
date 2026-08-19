import { NextResponse, type NextRequest } from "next/server";

import {
  MEMBER_SESSION_COOKIE,
  verifyMemberSessionToken,
} from "@/agent/lib/member-session";

const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY?.trim() &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
);

function pathOf(req: NextRequest): string {
  return req.nextUrl.pathname;
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return (
    pathname.startsWith("/how-it-works") ||
    pathname.startsWith("/get-started") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname === "/eve/v1/health" ||
    pathname.startsWith("/eve/v1/telegram") ||
    pathname.startsWith("/eve/v1/twilio") ||
    pathname.startsWith("/eve/v1/capture-sync") ||
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

async function telegramFirstMiddleware(req: NextRequest) {
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

  if (await hasMemberSession(req)) {
    return NextResponse.next();
  }

  // Without Clerk, protected APIs fail closed in their handlers.
  return NextResponse.next();
}

async function buildMiddleware() {
  if (!clerkConfigured) {
    return telegramFirstMiddleware;
  }

  const { clerkMiddleware, createRouteMatcher } = await import(
    "@clerk/nextjs/server"
  );

  const isPublicRoute = createRouteMatcher([
    "/",
    "/how-it-works(.*)",
    "/get-started(.*)",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/eve/v1/health",
    "/eve/v1/telegram(.*)",
    "/eve/v1/twilio(.*)",
    "/eve/v1/capture-sync(.*)",
    "/api/messaging-config",
    "/api/auth(.*)",
    "/api/onboarding/preview",
    "/api/inbound/resend",
  ]);
  const isAppShellRoute = createRouteMatcher(["/app(.*)"]);

  return clerkMiddleware(async (auth, req) => {
    if (isPublicRoute(req)) {
      return NextResponse.next();
    }

    if (isAppShellRoute(req)) {
      const { isAuthenticated } = await auth();
      if (isAuthenticated || (await hasMemberSession(req))) {
        return NextResponse.next();
      }
      const url = req.nextUrl.clone();
      url.pathname = "/get-started";
      url.searchParams.set("verify", "1");
      url.searchParams.set("next", req.nextUrl.pathname);
      return NextResponse.redirect(url);
    }

    if (await hasMemberSession(req)) {
      return NextResponse.next();
    }
    await auth.protect();
    return NextResponse.next();
  });
}

const middlewarePromise = buildMiddleware();

export default async function middleware(req: NextRequest, event: unknown) {
  const resolved = await middlewarePromise;
  return resolved(req, event as never);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
