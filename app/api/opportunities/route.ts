import { NextResponse } from "next/server";

import { listMemberOpportunities } from "@/agent/lib/opportunities";
import { opportunityStatuses } from "@/agent/lib/db/schema";
import {
  requireAuthenticatedMember,
  UnauthorizedError,
} from "@/lib/auth/member";

export async function GET(request: Request) {
  let member;
  try {
    member = await requireAuthenticatedMember();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam &&
    (opportunityStatuses as readonly string[]).includes(statusParam)
      ? (statusParam as (typeof opportunityStatuses)[number])
      : undefined;

  try {
    const items = await listMemberOpportunities(member.id, { status, limit: 50 });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[opportunities]", error);
    return NextResponse.json(
      { error: "Failed to load opportunities" },
      { status: 500 },
    );
  }
}
