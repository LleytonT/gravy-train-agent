import { Resend } from "resend";

export type ResendWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

export class WebhookVerificationError extends Error {
  readonly status = 401;

  constructor(message = "Invalid webhook signature") {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/**
 * Verify a Resend/Svix-signed webhook. Throws WebhookVerificationError on
 * forged, unsigned, or misconfigured requests.
 */
export function verifyResendWebhook(input: {
  payload: string;
  headers: Partial<ResendWebhookHeaders>;
  webhookSecret?: string | null;
  /** Injected for tests; defaults to Resend SDK verify. */
  verifyFn?: (args: {
    payload: string;
    headers: ResendWebhookHeaders;
    webhookSecret: string;
  }) => unknown;
}): unknown {
  const secret = input.webhookSecret?.trim();
  if (!secret) {
    throw new WebhookVerificationError("RESEND_WEBHOOK_SECRET is not configured");
  }

  const id = input.headers.id?.trim();
  const timestamp = input.headers.timestamp?.trim();
  const signature = input.headers.signature?.trim();
  if (!id || !timestamp || !signature) {
    throw new WebhookVerificationError("Missing Resend webhook signature headers");
  }

  const headers = { id, timestamp, signature };
  try {
    if (input.verifyFn) {
      return input.verifyFn({
        payload: input.payload,
        headers,
        webhookSecret: secret,
      });
    }
    const resend = new Resend(process.env.RESEND_API_KEY ?? "re_verify_only");
    return resend.webhooks.verify({
      payload: input.payload,
      headers,
      webhookSecret: secret,
    });
  } catch (error) {
    if (error instanceof WebhookVerificationError) throw error;
    throw new WebhookVerificationError(
      error instanceof Error ? error.message : "Invalid webhook signature",
    );
  }
}
