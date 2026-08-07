import { NextResponse } from "next/server";
import { z } from "zod";

import { ChannelLinkError, upsertMemberFromTelegramLogin } from "@/agent/lib/identity";
import { signMemberSessionToken } from "@/agent/lib/member-session";
import {
  TelegramLoginError,
  isTelegramLoginConfigured,
  probeTelegramLoginDomain,
  verifyTelegramLoginPayload,
} from "@/agent/lib/telegram-login";
import {
  MEMBER_SESSION_COOKIE,
  memberSessionCookieOptions,
} from "@/lib/auth/session-cookie";

const bodySchema = z.object({
  id: z.union([z.number(), z.string()]),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.union([z.number(), z.string()]),
  hash: z.string().min(1),
});

export async function GET() {
  const configured = isTelegramLoginConfigured();
  const botUsername =
    process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null;
  const domain = configured ? await probeTelegramLoginDomain({ botUsername }) : null;
  return NextResponse.json({
    configured,
    botUsername,
    loginDomain: domain?.domain ?? null,
    loginOrigin: domain?.origin ?? null,
    widgetDomainValid: domain?.widgetDomainValid ?? null,
    widgetDomainDetail: domain?.detail ?? null,
    /** Deep-link login works without BotFather /setdomain. */
    deepLinkLoginAvailable: configured,
  });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Telegram login payload" },
      { status: 400 },
    );
  }

  try {
    const verified = verifyTelegramLoginPayload(parsed.data);
    const member = await upsertMemberFromTelegramLogin({
      telegramUserId: verified.telegramUserId,
      username: verified.username,
      displayName: verified.displayName,
    });

    const token = await signMemberSessionToken({
      memberId: member.id,
      externalAuthId: member.externalAuthId ?? `telegram:${verified.telegramUserId}`,
      authenticator: "telegram",
      displayName: member.displayName,
    });

    const response = NextResponse.json({
      ok: true,
      memberId: member.id,
      displayName: member.displayName,
      authenticator: "telegram",
    });
    response.cookies.set(
      MEMBER_SESSION_COOKIE,
      token,
      memberSessionCookieOptions(),
    );
    return response;
  } catch (error) {
    if (error instanceof TelegramLoginError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof ChannelLinkError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[auth/telegram]", error);
    return NextResponse.json(
      { error: "Failed to complete Telegram login" },
      { status: 500 },
    );
  }
}
