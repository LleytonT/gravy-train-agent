import { NextResponse } from "next/server";

import {
  ensureInboundAlias,
  getInboundIngestionStatus,
  revokeInboundAlias,
} from "@/agent/lib/ingestion";
import {
  requireAuthenticatedMember,
  UnauthorizedError,
} from "@/lib/auth/member";

export const runtime = "nodejs";

export async function GET() {
  try {
    const member = await requireAuthenticatedMember();
    const status = await getInboundIngestionStatus(member.id);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load inbound status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const member = await requireAuthenticatedMember();
    const alias = await ensureInboundAlias(member.id);
    const status = await getInboundIngestionStatus(member.id);
    return NextResponse.json({ ok: true, alias, status });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to create inbound alias";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const member = await requireAuthenticatedMember();
    const revoked = await revokeInboundAlias(member.id);
    const status = await getInboundIngestionStatus(member.id);
    return NextResponse.json({ ok: true, revoked, status });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to revoke inbound alias";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
