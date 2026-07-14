#!/usr/bin/env npx tsx
/**
 * Seed SQLite with fake feed items + dossiers for Phase 1 local chat.
 */
import { config } from "dotenv";
config();

import { ensureSchema } from "../agent/lib/db/client.js";
import { repo } from "../agent/lib/db/repo.js";

async function main() {
  await ensureSchema();

  const seedCompanies = [
    {
      name: "Modal",
      website: "https://modal.com",
      category: "ai-infra",
      watchlistTier: "hot" as const,
      aliases: ["Modal Labs"],
    },
    {
      name: "Fireworks AI",
      website: "https://fireworks.ai",
      category: "ai-infra",
      watchlistTier: "hot" as const,
      aliases: ["Fireworks"],
    },
    {
      name: "Cursor",
      website: "https://cursor.com",
      category: "devtools",
      watchlistTier: "hot" as const,
      aliases: ["Anysphere"],
    },
    {
      name: "ElevenLabs",
      website: "https://elevenlabs.io",
      category: "ai-audio",
      watchlistTier: "warm" as const,
      aliases: ["Eleven Labs"],
    },
  ];

  const companies = [];
  for (const c of seedCompanies) {
    companies.push(await repo.upsertCompany(c));
  }

  const now = new Date();
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  // Fake unprocessed feed items (for classify demo)
  const rawInserted = await repo.insertRawItems([
    {
      source: "x",
      author: "Jane Founder",
      authorHeadline: "CEO @ Modal",
      excerpt:
        "Great week meeting customers in Sydney — APAC demand for GPU infra is real.",
      url: "https://x.com/example/status/seed-modal-sydney-1",
      postedAt: daysAgo(1),
    },
    {
      source: "linkedin",
      author: "Alex Recruiter",
      authorHeadline: "Talent @ Fireworks AI",
      excerpt:
        "We're hiring our first Sydney-based Solutions Engineer — Series B AI inference.",
      url: "https://linkedin.com/feed/update/seed-fw-se-1",
      postedAt: daysAgo(2),
    },
    {
      source: "x",
      author: "Sam Eng",
      authorHeadline: "ex-Vercel",
      excerpt:
        "Excited to join Cursor to help scale GTM across ANZ. Day one vibes.",
      url: "https://x.com/example/status/seed-cursor-talent-1",
      postedAt: daysAgo(3),
    },
    {
      source: "linkedin",
      author: "Priya Ops",
      authorHeadline: "Infra @ ElevenLabs",
      excerpt:
        "Exploring AU data residency options for enterprise voice workloads.",
      url: "https://linkedin.com/feed/update/seed-11labs-residency-1",
      postedAt: daysAgo(4),
    },
    {
      source: "x",
      author: "Noise Account",
      authorHeadline: "Random",
      excerpt: "Coffee in Melbourne hits different ☕",
      url: "https://x.com/example/status/seed-noise-1",
      postedAt: daysAgo(1),
    },
  ]);

  // Pre-baked signals so dossiers work even without AI_GATEWAY_API_KEY
  const modal = companies.find((c) => c.name === "Modal")!;
  const fireworks = companies.find((c) => c.name === "Fireworks AI")!;
  const cursor = companies.find((c) => c.name === "Cursor")!;
  const eleven = companies.find((c) => c.name === "ElevenLabs")!;

  await repo.saveSignal({
    companyId: modal.id,
    type: "exec_tour",
    direction: "positive",
    strength: 4,
    summary: "CEO spent a week meeting Sydney customers — APAC demand signal.",
    sourceUrl: "https://x.com/example/status/seed-modal-sydney-1",
    excerpt: "Great week meeting customers in Sydney",
    observedAt: daysAgo(1),
  });
  await repo.saveSignal({
    companyId: modal.id,
    type: "sydney_infra",
    direction: "positive",
    strength: 3,
    summary: "Public chatter about APAC GPU capacity planning.",
    observedAt: daysAgo(12),
  });

  await repo.saveSignal({
    companyId: fireworks.id,
    type: "adjacent_se_csm",
    direction: "positive",
    strength: 5,
    summary: "First Sydney Solutions Engineer role posted (Series B AI infra).",
    sourceUrl: "https://linkedin.com/feed/update/seed-fw-se-1",
    observedAt: daysAgo(2),
  });

  await repo.saveSignal({
    companyId: cursor.id,
    type: "talent_flow_strong_org",
    direction: "positive",
    strength: 4,
    summary: "ex-Vercel hire joining to scale GTM across ANZ.",
    sourceUrl: "https://x.com/example/status/seed-cursor-talent-1",
    observedAt: daysAgo(3),
  });

  await repo.saveSignal({
    companyId: eleven.id,
    type: "sydney_infra",
    direction: "positive",
    strength: 3,
    summary: "Exploring AU data residency for enterprise voice.",
    observedAt: daysAgo(4),
  });

  await repo.createOpportunity({
    companyId: fireworks.id,
    headline: "[digest] Fireworks AI — first Sydney SE hire",
    score: 7.5,
    status: "new",
  });

  console.log(
    JSON.stringify(
      {
        companies: companies.map((c) => c.name),
        rawItemsInserted: rawInserted,
        note: "Seed complete. Chat locally: pnpm dev",
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
