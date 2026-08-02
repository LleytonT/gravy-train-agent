import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ConversationAccessError,
  ConversationNotFoundError,
  appendMessage,
  listMessages,
} from "@/agent/lib/conversation";
import { conversationSurfaces, messageRoles } from "@/agent/lib/db/schema";
import {
  requireAuthenticatedMember,
  UnauthorizedError,
} from "@/lib/auth/member";

const postSchema = z.object({
  body: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(200),
  role: z.enum(messageRoles).default("member"),
  surface: z.enum(conversationSurfaces).default("web"),
  externalMessageId: z.string().trim().optional(),
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
  console.error("[conversations/:id/messages]", error);
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

function serializeMessage(message: {
  id: string;
  conversationId: string;
  role: string;
  surface: string;
  body: string;
  externalMessageId: string | null;
  idempotencyKey: string;
  createdAt: Date | string;
}) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    surface: message.surface,
    body: message.body,
    externalMessageId: message.externalMessageId,
    idempotencyKey: message.idempotencyKey,
    createdAt: message.createdAt,
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const member = await requireAuthenticatedMember();
    const { id } = await context.params;
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const directionParam = url.searchParams.get("direction");
    const direction =
      directionParam === "forward" || directionParam === "backward"
        ? directionParam
        : "backward";

    const result = await listMessages(member.id, id, {
      cursor,
      limit,
      direction,
    });
    return NextResponse.json({
      messages: result.messages.map(serializeMessage),
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return errorResponse(error);
  }
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

    const parsed = postSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await appendMessage({
      memberId: member.id,
      conversationId: id,
      role: parsed.data.role,
      surface: parsed.data.surface,
      body: parsed.data.body,
      idempotencyKey: parsed.data.idempotencyKey,
      externalMessageId: parsed.data.externalMessageId,
    });

    return NextResponse.json(
      {
        message: serializeMessage(result.message),
        created: result.created,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
