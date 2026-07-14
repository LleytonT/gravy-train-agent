---
description: Use when the nightly_scout schedule fires or the user asks you to run a scout pass over captured feed items.
---

# Nightly pipeline procedure

Capture already ran locally. You consume the DB.

1. Start a run log.
2. `get_new_feed_items` — if empty, one-line "nothing new" and finish.
3. `classify_feed_items` in batches (tool uses Haiku). Do not hand-classify.
4. `save_signal` for each hit. Upsert companies as needed.
5. `search_web` for new companies or strength ≥4 — **max 5 searches**.
6. `score_company` for every touched company; respect user-profile prefs.
7. `create_opportunity` for immediate/digest tiers if no ping in last 48h.
8. Draft digest ≤1,200 chars: urgents → what you missed (3–6 bullets) → asks.
9. `send_whatsapp_message` if Twilio is configured (tool no-ops cleanly when not).
10. `mark_items_processed` + finish run log with counts.

Always return the digest as your final message too (local/dev visibility).
