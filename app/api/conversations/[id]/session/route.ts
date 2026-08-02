import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ConversationNotFoundError,
  associateAgentSession,
  getAgentSession,
  toEveSessionCursor,
} from "@/agent/lib/conversation";
import { conversationSurfaces } from "@/agent/lib/db/schema";
import {
  requireAuthenticatedMember,
  UnauthorizedError,
} from "@/lib/auth/member";

const putSchema = z.object({
  surface: z.enum(conversationSurfaces).default("web"),
  eveSessionId: z.string().trim().min(1),
  continuationToken: z.string().trim().optional().nullable(),
  streamIndex: z.number().int().min(0).optional(),
  summary: z.string().trim().max(500).optional().nullable(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

function errorResponse(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ConversationNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error("[conversations/:id/session]", error);
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const member = await requireAuthenticatedMember();
    const { id } = await context.params;
    const url = new URL(request.url);
    const surfaceParam = url.searchParams.get("surface") ?? "web";
    const surfaceParse = z.enum(conversationSurfaces).safeParse(surfaceParam);
    if (!surfaceParse.success) {
      return NextResponse.json({ error: "Invalid surface" }, { status: 400 });
    }

    const session = await getAgentSession(member.id, id, surfaceParse.data);
    return NextResponse.json({
      session: session
        ? {
            surface: session.surface,
            eveSessionId: session.eveSessionId,
            continuationToken: session.continuationTokenRef,
            streamIndex: session.lastEventIndex,
            summary: session.summary,
            updatedAt: session.updatedAt,
          }
        : null,
      eveSession: toEveSessionCursor(session),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const member = await requireAuthenticatedMember();
    const { id } = await context.params;
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

    const parsed = putSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const session = await associateAgentSession({
      memberId: member.id,
      conversationId: id,
      surface: parsed.data.surface,
      eveSessionId: parsed.data.eveSessionId,
      continuationTokenRef: parsed.data.continuationToken,
      lastEventIndex: parsed.data.streamIndex,
      summary: parsed.data.summary,
    });

    return NextResponse.json({
      session: {
        surface: session.surface,
        eveSessionId: session.eveSessionId,
        continuationToken: session.continuationTokenRef,
        streamIndex: session.lastEventIndex,
        summary: session.summary,
        updatedAt: session.updatedAt,
      },
      eveSession: toEveSessionCursor(session),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
