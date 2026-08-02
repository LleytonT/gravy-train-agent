import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createConversation,
  listConversations,
} from "@/agent/lib/conversation";
import {
  requireAuthenticatedMember,
  UnauthorizedError,
} from "@/lib/auth/member";

const createSchema = z.object({
  title: z.string().trim().max(120).optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  console.error("[conversations]", error);
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const member = await requireAuthenticatedMember();
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const result = await listConversations(member.id, { cursor, limit });
    return NextResponse.json({
      conversations: result.conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      })),
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireAuthenticatedMember();
    let json: unknown = {};
    try {
      json = await request.json();
    } catch {
      json = {};
    }
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    // Never trust client member ids.
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

    const conversation = await createConversation(member.id, {
      title: parsed.data.title,
    });
    return NextResponse.json(
      {
        conversation: {
          id: conversation.id,
          title: conversation.title,
          status: conversation.status,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
