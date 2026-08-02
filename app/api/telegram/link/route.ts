import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ChannelLinkError,
  createTelegramLinkToken,
  getTelegramIdentityForMember,
  revokeTelegramIdentity,
} from "@/agent/lib/identity";
import {
  getMessagingDestination,
  isTelegramConfigured,
  saveMessagingDestination,
  telegramBotInfoLink,
} from "@/agent/lib/messaging";
import {
  requireAuthenticatedMember,
  UnauthorizedError,
} from "@/lib/auth/member";

const patchSchema = z.object({
  consentUpdates: z.boolean().optional(),
  quietHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      end: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      timezone: z.string().trim().nullable().optional(),
    })
    .optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ChannelLinkError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("[telegram/link]", error);
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Current Telegram link status for the signed-in member. */
export async function GET() {
  try {
    const member = await requireAuthenticatedMember();
    const identity = await getTelegramIdentityForMember(member.id);
    const messaging = await getMessagingDestination(member.id);
    return NextResponse.json({
      configured: isTelegramConfigured(),
      botUsername: process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null,
      botInfoLink: telegramBotInfoLink(),
      linked: Boolean(identity),
      telegramUserId: identity?.externalUserId ?? null,
      telegramUsername: identity?.username ?? messaging.telegramUsername,
      linkedAt: identity?.linkedAt?.toISOString() ?? messaging.linkedAt,
      consentUpdates: messaging.consentUpdates,
      quietHours: messaging.quietHours,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Mint a short-lived, single-use Telegram deep-link token for the signed-in member.
 * Never accepts a client-supplied member id or Telegram username as identity.
 */
export async function POST(request: Request) {
  try {
    const member = await requireAuthenticatedMember();
    let json: unknown = {};
    try {
      json = await request.json();
    } catch {
      json = {};
    }
    if (
      json &&
      typeof json === "object" &&
      ("memberId" in json ||
        "externalAuthId" in json ||
        "telegramUserId" in json ||
        "telegramUsername" in json)
    ) {
      return NextResponse.json(
        {
          error:
            "Client-supplied member or Telegram identity is not allowed. Open the minted deep link in Telegram instead.",
        },
        { status: 400 },
      );
    }

    const minted = await createTelegramLinkToken(member.id);
    return NextResponse.json(
      {
        token: minted.token,
        deepLink: minted.deepLink,
        expiresAt: minted.expiresAt.toISOString(),
        botUsername: minted.botUsername,
        configured: isTelegramConfigured(),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Update consent / quiet hours without minting a new token. */
export async function PATCH(request: Request) {
  try {
    const member = await requireAuthenticatedMember();
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (
      json &&
      typeof json === "object" &&
      ("memberId" in json || "externalAuthId" in json)
    ) {
      return NextResponse.json(
        { error: "Client-supplied member identity is not allowed" },
        { status: 400 },
      );
    }
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const messaging = await saveMessagingDestination(member.id, {
      consentUpdates: parsed.data.consentUpdates,
      quietHours: parsed.data.quietHours,
    });
    const identity = await getTelegramIdentityForMember(member.id);
    return NextResponse.json({
      linked: Boolean(identity),
      consentUpdates: messaging.consentUpdates,
      quietHours: messaging.quietHours,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Revoke Telegram immediately — proactive delivery stops. */
export async function DELETE() {
  try {
    const member = await requireAuthenticatedMember();
    await revokeTelegramIdentity(member.id);
    await saveMessagingDestination(member.id, {
      telegramChatId: null,
      consentUpdates: false,
    });
    return NextResponse.json({ revoked: true, linked: false });
  } catch (error) {
    return errorResponse(error);
  }
}
