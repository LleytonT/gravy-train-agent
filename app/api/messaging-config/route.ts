import { NextResponse } from "next/server";

import { telegramDeepLink } from "@/agent/lib/messaging";

/** Public bot deep-link for onboarding UI (username is not secret). */
export async function GET() {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null;
  return NextResponse.json({
    botUsername: username,
    deepLink: telegramDeepLink(),
    configured: Boolean(username && process.env.TELEGRAM_BOT_TOKEN),
  });
}
