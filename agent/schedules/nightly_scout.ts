import { defineSchedule } from "eve/schedules";

/**
 * Nightly scout at 13:00 UTC ≈ 23:00 AEST (UTC+10).
 * During AEDT (UTC+11) this fires at midnight local — acceptable drift;
 * adjust CRON via env documentation if you need exact AEDT 23:00.
 *
 * In Phase 3 (pre-WhatsApp): markdown task mode — agent runs tools and the
 * final message is the digest (inspect via session stream / TUI).
 * Phase 4 schedule variant hands off to Twilio when credentials exist.
 */
const nightlyPrompt = `Run the nightly Gravy Scout pipeline now.

Load skill nightly-pipeline (and opportunity-signals / scoring as needed).
Drive tools free-form: get_new_feed_items → classify_feed_items → save_signal →
search_web (≤5) → score_company → create_opportunity → mark_items_processed →
log_run_summary.

Then produce the WhatsApp-ready digest (≤1200 chars).
If Twilio/WhatsApp is configured, call send_whatsapp_message with that digest.
Always also return the digest as your final message (local/dev visibility).
If nothing notable, one line only — never pad.
If there are zero unprocessed items, say so briefly and stop.`;

export default defineSchedule({
  cron: "0 13 * * *",
  markdown: nightlyPrompt,
});
