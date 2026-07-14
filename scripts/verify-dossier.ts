#!/usr/bin/env npx tsx
import { ensureSchema } from "../agent/lib/db/client.js";
import { repo } from "../agent/lib/db/repo.js";
import { scoreCompany } from "../agent/lib/scoring.js";

async function main() {
  await ensureSchema();
  const d = await repo.getCompanyDossier("Fireworks AI");
  if (!d) {
    throw new Error("Fireworks AI dossier missing — run pnpm seed");
  }
  const scored = scoreCompany(d.signals, {
    watchlistTier: d.company.watchlistTier,
    companyCategory: d.company.category,
    companyName: d.company.name,
  });
  console.log(
    JSON.stringify(
      {
        company: d.company.name,
        signals: d.signals.length,
        opportunities: d.opportunities.length,
        score: scored.score,
        pingTier: scored.pingTier,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
