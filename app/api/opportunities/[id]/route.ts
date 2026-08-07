import { NextResponse } from "next/server";
import { z } from "zod";

import {
  dispositionActions,
  getMemberOpportunity,
  setOpportunityDisposition,
} from "@/agent/lib/opportunities";
import {
  requireAuthenticatedMember,
  UnauthorizedError,
} from "@/lib/auth/member";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  let member;
  try {
    member = await requireAuthenticatedMember();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  const { id } = await context.params;
  const detail = await getMemberOpportunity(member.id, id);
  if (!detail) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }
  return NextResponse.json({ opportunity: detail });
}

const patchSchema = z.object({
  disposition: z.enum(dispositionActions),
});

export async function PATCH(request: Request, context: RouteContext) {
  let member;
  try {
    member = await requireAuthenticatedMember();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "disposition is required", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const updated = await setOpportunityDisposition({
    memberId: member.id,
    opportunityId: id,
    disposition: parsed.data.disposition,
  });
  if (!updated) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }
  return NextResponse.json({ opportunity: updated });
}
