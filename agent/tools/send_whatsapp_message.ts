import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Proactive WhatsApp delivery via Twilio Messages API.
 * Used at the end of a nightly scout when TWILIO_* + WHATSAPP_TO are set.
 * No-ops with a clear note when credentials are missing (local Phase 3).
 */
export default defineTool({
  description:
    "Send a WhatsApp (or SMS) message to the user via Twilio. Use for the nightly digest when Twilio is configured; otherwise skip and just return the digest as your final reply.",
  inputSchema: z.object({
    body: z.string().min(1).max(1500),
    to: z
      .string()
      .optional()
      .describe("Override recipient; defaults to WHATSAPP_TO"),
  }),
  async execute({ body, to }) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from =
      process.env.TWILIO_WHATSAPP_FROM ?? process.env.TWILIO_MESSAGING_FROM;
    const recipient = to ?? process.env.WHATSAPP_TO;

    if (!accountSid || !authToken || !from || !recipient) {
      return {
        sent: false,
        skipped: true,
        reason:
          "Twilio/WhatsApp not configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, WHATSAPP_TO). Return digest as final message instead.",
      };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams({
      To: recipient,
      From: from,
      Body: body,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const json = (await res.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      error_message?: string;
    };

    if (!res.ok) {
      return {
        sent: false,
        error: json.message ?? json.error_message ?? `HTTP ${res.status}`,
      };
    }

    return { sent: true, sid: json.sid, to: recipient };
  },
});
