import { NextResponse, type NextRequest } from "next/server";

import {
  fetchReceivedEmailContent,
  processInboundJobAlertEmail,
  verifyResendWebhook,
  WebhookVerificationError,
  type ReceivedEmailContent,
} from "@/agent/lib/ingestion";
import type { ResendReceivedEvent } from "@/agent/lib/ingestion/resend/fetch-email";

export const runtime = "nodejs";

function header(req: NextRequest, name: string): string | undefined {
  return req.headers.get(name) ?? undefined;
}

export async function POST(req: NextRequest) {
  const payload = await req.text();

  let event: ResendReceivedEvent;
  try {
    event = verifyResendWebhook({
      payload,
      headers: {
        id: header(req, "svix-id"),
        timestamp: header(req, "svix-timestamp"),
        signature: header(req, "svix-signature"),
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    }) as ResendReceivedEvent;
  } catch (error) {
    const status =
      error instanceof WebhookVerificationError ? error.status : 401;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid webhook signature",
      },
      { status },
    );
  }

  if (event.type && event.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  let email: ReceivedEmailContent;
  try {
    email = await fetchReceivedEmailContent(event);
  } catch (error) {
    console.error("[inbound/resend] failed to fetch email", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch email",
      },
      { status: 500 },
    );
  }

  try {
    const result = await processInboundJobAlertEmail(email);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[inbound/resend] processing failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Processing failed",
      },
      { status: 500 },
    );
  }
}
