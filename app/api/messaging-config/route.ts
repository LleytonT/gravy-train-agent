import { NextResponse } from "next/server";

import {
  isTelegramConfigured,
  telegramBotInfoLink,
} from "@/agent/lib/messaging";

/**
 * Public bot info for onboarding UI.
 * Member-bound deep links come from authenticated POST /api/telegram/link —
 * never from a static `?start=link` payload.
 */
export async function GET() {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null;
  return NextResponse.json({
    botUsername: username,
    botInfoLink: telegramBotInfoLink(),
    /** @deprecated use botInfoLink + /api/telegram/link */
    deepLink: null,
    configured: isTelegramConfigured(),
    linkPath: "/api/telegram/link",
  });
}
