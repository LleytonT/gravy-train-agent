import { defineSchedule } from "eve/schedules";

import { runDiscovery } from "../lib/discovery/run.js";

/**
 * Nightly discovery at 13:00 UTC ≈ 23:00 AEST.
 * Deterministic TypeScript orchestration (GS-007) — not free-form agent tooling.
 */
export default defineSchedule({
  cron: "0 13 * * *",
  async run({ waitUntil }) {
    const day = new Date().toISOString().slice(0, 10);
    waitUntil(
      runDiscovery({
        kind: "schedule",
        idempotencyKey: `nightly:${day}`,
      }).then((outcome) => {
        console.info("[nightly_scout]", JSON.stringify(outcome));
      }),
    );
  },
});
