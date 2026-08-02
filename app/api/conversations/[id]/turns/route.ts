import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ConversationAccessError,
  ConversationNotFoundError,
  beginSurfaceTurn,
  completeSurfaceTurn,
  syncSurfaceSessionCursor,
} from "@/agent/lib/conversation";
import { conversationSurfaces } from "@/agent/lib/db/schema";
import {
  requireAuthenticatedMember,
  UnauthorizedError,
} from "@/lib/auth/member";

const beginSchema = z.object({
  action: z.literal("begin").optional(),
  body: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(200),
  surface: z.enum(conversationSurfaces).default("web"),
  externalMessageId: z.string().trim().optional(),
  titleFromBody: z.boolean().optional(),
});

const completeSchema = z.object({
  action: z.literal("complete"),
  assistantBody: z.string().trim().min(1),
  assistantIdempotencyKey: z.string().trim().min(1).max(200),
  surface: z.enum(conversationSurfaces).default("web"),
  eveSessionId: z.string().trim().min(1),
  continuationToken: z.string().trim().optional().nullable(),
  streamIndex: z.number().int().min(0).optional(),
});

const syncSchema = z.object({
  action: z.literal("sync"),
  surface: z.enum(conversationSurfaces).default("web"),
  eveSessionId: z.string().trim().min(1),
  continuationToken: z.string().trim().optional().nullable(),
  streamIndex: z.number().int().min(0).optional(),
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
  if (error instanceof ConversationAccessError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error("[conversations/:id/turns]", error);
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request, context: RouteContext) {
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

    const action =
      json && typeof json === "object" && "action" in json
        ? (json as { action?: unknown }).action
        : "begin";

    if (action === "complete") {
      const parsed = completeSchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid body", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const result = await completeSurfaceTurn({
        memberId: member.id,
        conversationId: id,
        surface: parsed.data.surface,
        assistantBody: parsed.data.assistantBody,
        assistantIdempotencyKey: parsed.data.assistantIdempotencyKey,
        eveSessionId: parsed.data.eveSessionId,
        continuationTokenRef: parsed.data.continuationToken,
        lastEventIndex: parsed.data.streamIndex,
      });
      return NextResponse.json({
        action: "complete",
        created: result.created,
        assistantMessage: {
          id: result.assistantMessage.id,
          role: result.assistantMessage.role,
          surface: result.assistantMessage.surface,
          body: result.assistantMessage.body,
          createdAt: result.assistantMessage.createdAt,
          idempotencyKey: result.assistantMessage.idempotencyKey,
        },
        eveSession: {
          sessionId: result.agentSession.eveSessionId,
          continuationToken: result.agentSession.continuationTokenRef,
          streamIndex: result.agentSession.lastEventIndex,
        },
      });
    }

    if (action === "sync") {
      const parsed = syncSchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid body", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const session = await syncSurfaceSessionCursor({
        memberId: member.id,
        conversationId: id,
        surface: parsed.data.surface,
        eveSessionId: parsed.data.eveSessionId,
        continuationTokenRef: parsed.data.continuationToken,
        lastEventIndex: parsed.data.streamIndex,
      });
      return NextResponse.json({
        action: "sync",
        eveSession: {
          sessionId: session.eveSessionId,
          continuationToken: session.continuationTokenRef,
          streamIndex: session.lastEventIndex,
        },
      });
    }

    const parsed = beginSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await beginSurfaceTurn({
      memberId: member.id,
      conversationId: id,
      surface: parsed.data.surface,
      body: parsed.data.body,
      idempotencyKey: parsed.data.idempotencyKey,
      externalMessageId: parsed.data.externalMessageId,
      titleFromBody: parsed.data.titleFromBody,
    });

    return NextResponse.json({
      action: "begin",
      created: result.created,
      conversation: {
        id: result.conversation.id,
        title: result.conversation.title,
        updatedAt: result.conversation.updatedAt,
      },
      message: {
        id: result.message.id,
        role: result.message.role,
        surface: result.message.surface,
        body: result.message.body,
        createdAt: result.message.createdAt,
        idempotencyKey: result.message.idempotencyKey,
      },
      eveSession: result.eveSession,
      contextPrefix: result.contextPrefix,
      shouldInjectContext: result.shouldInjectContext,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
