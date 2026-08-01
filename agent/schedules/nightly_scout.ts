import { defineSchedule } from "eve/schedules";

/**
 * Nightly scout at 13:00 UTC ≈ 23:00 AEST (UTC+10).
 * Task-mode: agent runs the pipeline free-form, then pushes via
 * send_telegram_message when the user has linked Telegram + consented.
 * Falls back to WhatsApp tool if Twilio is configured; always returns
 * the digest as the final message for local/dev visibility.
 */
const nightlyPrompt = `Run the nightly Gravy Scout pipeline now.

Load skill nightly-pipeline (and opportunity-signals / scoring as needed).
Drive tools free-form: get_new_feed_items → classify_feed_items → save_signal →
search_web (≤5) → score_company → create_opportunity → mark_items_processed →
log_run_summary.

Then produce a mobile-ready digest (≤1200 chars).
1. Call save_messaging_destination with action=read.
2. If linked and consentUpdates=true, call send_telegram_message with the digest.
3. Else if Twilio/WhatsApp is configured, call send_whatsapp_message.
Always also return the digest as your final message (local/dev visibility).
If nothing notable, one line only — never pad.
If there are zero unprocessed items, say so briefly and stop.`;

export default defineSchedule({
  cron: "0 13 * * *",
  markdown: nightlyPrompt,
});
