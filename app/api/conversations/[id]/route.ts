import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ConversationNotFoundError,
  getConversation,
  updateConversationTitle,
} from "@/agent/lib/conversation";
import {
  requireAuthenticatedMember,
  UnauthorizedError,
} from "@/lib/auth/member";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120),
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
  console.error("[conversations/:id]", error);
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const member = await requireAuthenticatedMember();
    const { id } = await context.params;
    const conversation = await getConversation(member.id, id);
    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const member = await requireAuthenticatedMember();
    const { id } = await context.params;
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "title is required", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const conversation = await updateConversationTitle(
      member.id,
      id,
      parsed.data.title,
    );
    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
