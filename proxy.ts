import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Public marketing + auth entry points. Everything else (chat, onboarding API,
 * Eve HTTP) requires a signed-in Clerk session.
 */
const isPublicRoute = createRouteMatcher([
  "/how-it-works(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/eve/v1/health",
  "/api/messaging-config",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
