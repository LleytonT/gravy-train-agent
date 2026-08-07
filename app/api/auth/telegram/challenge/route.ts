import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ChannelLinkError,
  createTelegramLoginChallenge,
  getTelegramLoginChallengeStatus,
} from "@/agent/lib/identity";
import { signMemberSessionToken } from "@/agent/lib/member-session";
import { isTelegramLoginConfigured } from "@/agent/lib/telegram-login";
import {
  MEMBER_SESSION_COOKIE,
  memberSessionCookieOptions,
} from "@/lib/auth/session-cookie";

const completeSchema = z.object({
  challengeId: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  if (!isTelegramLoginConfigured()) {
    return NextResponse.json(
      { error: "Telegram Login is not configured", code: "misconfigured" },
      { status: 503 },
    );
  }

  let intent: "start" | "complete" = "start";
  let body: unknown = null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (
      body &&
      typeof body === "object" &&
      "intent" in body &&
      (body as { intent?: unknown }).intent === "complete"
    ) {
      intent = "complete";
    }
  }

  try {
    if (intent === "start") {
      const challenge = await createTelegramLoginChallenge();
      return NextResponse.json({
        ok: true,
        challengeId: challenge.challengeId,
        deepLink: challenge.deepLink,
        expiresAt: challenge.expiresAt.toISOString(),
        botUsername: challenge.botUsername,
      });
    }

    const parsed = completeSchema.safeParse({
      challengeId:
        body && typeof body === "object"
          ? (body as { challengeId?: unknown }).challengeId
          : undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "challengeId is required" },
        { status: 400 },
      );
    }

    const status = await getTelegramLoginChallengeStatus(parsed.data.challengeId);
    if (status.status === "pending") {
      return NextResponse.json(
        { ok: false, status: "pending", expiresAt: status.expiresAt.toISOString() },
        { status: 202 },
      );
    }
    if (status.status !== "ready") {
      return NextResponse.json(
        { error: `Challenge ${status.status}`, code: status.status },
        { status: status.status === "expired" ? 410 : 404 },
      );
    }

    const token = await signMemberSessionToken({
      memberId: status.memberId,
      externalAuthId: status.externalAuthId,
      authenticator: "telegram",
      displayName: status.displayName,
    });
    const response = NextResponse.json({
      ok: true,
      status: "ready",
      memberId: status.memberId,
      displayName: status.displayName,
      authenticator: "telegram",
    });
    response.cookies.set(
      MEMBER_SESSION_COOKIE,
      token,
      memberSessionCookieOptions(),
    );
    return response;
  } catch (error) {
    if (error instanceof ChannelLinkError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[auth/telegram/challenge]", error);
    return NextResponse.json(
      { error: "Failed to start Telegram login challenge" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const challengeId = new URL(request.url).searchParams.get("challengeId");
  if (!challengeId) {
    return NextResponse.json(
      { error: "challengeId is required" },
      { status: 400 },
    );
  }

  try {
    const status = await getTelegramLoginChallengeStatus(challengeId);
    if (status.status === "pending") {
      return NextResponse.json({
        status: "pending",
        expiresAt: status.expiresAt.toISOString(),
        deepLink: status.deepLink,
        botUsername: status.botUsername,
      });
    }
    if (status.status === "ready") {
      return NextResponse.json({
        status: "ready",
        memberId: status.memberId,
        displayName: status.displayName,
      });
    }
    return NextResponse.json(
      { status: status.status },
      { status: status.status === "expired" ? 410 : 404 },
    );
  } catch (error) {
    console.error("[auth/telegram/challenge]", error);
    return NextResponse.json(
      { error: "Failed to read Telegram login challenge" },
      { status: 500 },
    );
  }
}
