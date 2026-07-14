import { twilioChannel } from "eve/channels/twilio";

/**
 * Twilio WhatsApp (sandbox OK).
 *
 * Env:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM  e.g. whatsapp:+14155238886 (sandbox)
 *   WHATSAPP_TO          e.g. whatsapp:+61XXXXXXXXX  (your number)
 *   WHATSAPP_ALLOW_FROM  optional override; defaults to WHATSAPP_TO
 *
 * Eve's Twilio channel is SMS/WhatsApp-capable via Twilio Messaging —
 * use the `whatsapp:` prefix on From/To numbers.
 *
 * Flag vs prompt assumption: the first-class Twilio channel docs emphasize SMS
 * + voice; WhatsApp works through the same Messages API with whatsapp: addresses.
 */

function allowFrom(): string | string[] {
  const raw =
    process.env.WHATSAPP_ALLOW_FROM ??
    process.env.WHATSAPP_TO ??
    "";
  if (!raw) {
    // Fail closed until configured — use "*" only for local Twilio webhook tests.
    return process.env.TWILIO_ALLOW_FROM_WILDCARD === "1" ? "*" : [];
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

const fromNumber =
  process.env.TWILIO_WHATSAPP_FROM ??
  process.env.TWILIO_MESSAGING_FROM ??
  undefined;

export default twilioChannel({
  allowFrom: allowFrom(),
  messaging: fromNumber ? { from: fromNumber } : undefined,
  webhookUrl: process.env.TWILIO_WEBHOOK_URL,
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
});
