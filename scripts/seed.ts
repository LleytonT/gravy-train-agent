#!/usr/bin/env npx tsx
/**
 * Explicitly seed development with fake feed items, dossiers, and role data.
 * This script is never called automatically by the application.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

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
    {
      name: "Decagon",
      website: "https://decagon.ai",
      category: "ai-cx",
      watchlistTier: "hot" as const,
      aliases: ["Decagon AI"],
    },
    {
      name: "Sierra",
      website: "https://sierra.ai",
      category: "ai-agents",
      watchlistTier: "hot" as const,
      aliases: ["Sierra AI"],
    },
  ];

  const companies = [];
  for (const c of seedCompanies) {
    companies.push(await repo.upsertCompany(c));
  }

  const now = new Date();
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

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
      source: "linkedin",
      author: "Decagon Talent",
      authorHeadline: "Recruiting @ Decagon",
      excerpt:
        "Opening a Field Engineer seat for Australia — AI customer agents, Sydney preferred.",
      url: "https://linkedin.com/feed/update/seed-decagon-fe-1",
      postedAt: daysAgo(1),
    },
    {
      source: "x",
      author: "Sierra GTM",
      authorHeadline: "GTM @ Sierra",
      excerpt:
        "Looking for a Deployment Engineer in APAC to partner with our first ANZ AEs.",
      url: "https://x.com/example/status/seed-sierra-de-1",
      postedAt: daysAgo(2),
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

  const modal = companies.find((c) => c.name === "Modal")!;
  const fireworks = companies.find((c) => c.name === "Fireworks AI")!;
  const cursor = companies.find((c) => c.name === "Cursor")!;
  const eleven = companies.find((c) => c.name === "ElevenLabs")!;
  const decagon = companies.find((c) => c.name === "Decagon")!;
  const sierra = companies.find((c) => c.name === "Sierra")!;

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
    companyId: cursor.id,
    type: "adjacent_se_csm",
    direction: "positive",
    strength: 4,
    summary: "Rumored Sales Engineer / Field Engineer seats for ANZ.",
    observedAt: daysAgo(5),
  });

  await repo.saveSignal({
    companyId: eleven.id,
    type: "sydney_infra",
    direction: "positive",
    strength: 3,
    summary: "Exploring AU data residency for enterprise voice.",
    observedAt: daysAgo(4),
  });

  await repo.saveSignal({
    companyId: decagon.id,
    type: "first_apac_gtm_job",
    direction: "positive",
    strength: 5,
    summary: "Field Engineer Australia / Sydney seat opening.",
    sourceUrl: "https://linkedin.com/feed/update/seed-decagon-fe-1",
    observedAt: daysAgo(1),
  });
  await repo.saveSignal({
    companyId: decagon.id,
    type: "adjacent_se_csm",
    direction: "positive",
    strength: 4,
    summary: "SE-family hire before AE scale-up in ANZ.",
    observedAt: daysAgo(1),
  });

  await repo.saveSignal({
    companyId: sierra.id,
    type: "adjacent_se_csm",
    direction: "positive",
    strength: 5,
    summary: "Deployment Engineer APAC to partner with first ANZ AEs.",
    sourceUrl: "https://x.com/example/status/seed-sierra-de-1",
    observedAt: daysAgo(2),
  });
  await repo.saveSignal({
    companyId: sierra.id,
    type: "anz_expansion",
    direction: "positive",
    strength: 4,
    summary: "ANZ GTM expansion language — first AE + SE pairing.",
    observedAt: daysAgo(8),
  });

  // Open roles for personalization
  const openRoleSeeds = [
    {
      companyId: fireworks.id,
      title: "Solutions Engineer",
      location: "Sydney, Australia",
      sourceUrl: "https://linkedin.com/feed/update/seed-fw-se-1",
    },
    {
      companyId: cursor.id,
      title: "Sales Engineer",
      location: "APAC / Sydney",
      status: "rumored" as const,
    },
    {
      companyId: cursor.id,
      title: "Field Engineer",
      location: "Australia",
      status: "rumored" as const,
    },
    {
      companyId: decagon.id,
      title: "Field Engineer",
      location: "Sydney, Australia",
      sourceUrl: "https://linkedin.com/feed/update/seed-decagon-fe-1",
    },
    {
      companyId: sierra.id,
      title: "Deployment Engineer",
      location: "APAC",
      sourceUrl: "https://x.com/example/status/seed-sierra-de-1",
    },
    {
      companyId: sierra.id,
      title: "Sales Engineer",
      location: "Australia",
      status: "rumored" as const,
    },
    {
      companyId: modal.id,
      title: "Solutions Engineer",
      location: "Sydney",
      status: "rumored" as const,
    },
  ];

  for (const role of openRoleSeeds) {
    await repo.upsertOpenRole(role);
  }

  // Outreach targets: hiring manager / peer / adjacent
  const outreachSeeds = [
    {
      companyId: decagon.id,
      name: "Morgan Hale",
      title: "Head of GTM, APAC",
      kind: "hiring_manager" as const,
      whyReachOut:
        "Owns APAC GTM hiring; Field Engineer AU reports into this seat.",
      relatedRoleTitle: "Field Engineer",
      linkedInUrl: "https://www.linkedin.com/in/example-decagon-hm",
    },
    {
      companyId: decagon.id,
      name: "Jamie Okonkwo",
      title: "Field Engineer, US",
      kind: "peer_in_seat" as const,
      whyReachOut:
        "Current Field Engineer — best coffee-chat for ramp, territory, and bar.",
      relatedRoleTitle: "Field Engineer",
    },
    {
      companyId: decagon.id,
      name: "Riley Park",
      title: "Account Executive, ANZ",
      kind: "adjacent" as const,
      whyReachOut: "Adjacent AE who will pair with the AU Field Engineer.",
      relatedRoleTitle: "Field Engineer",
    },
    {
      companyId: sierra.id,
      name: "Taylor Nguyen",
      title: "Director, Solutions APAC",
      kind: "hiring_manager" as const,
      whyReachOut: "Hiring manager for Deployment / Sales Engineer APAC.",
      relatedRoleTitle: "Deployment Engineer",
    },
    {
      companyId: sierra.id,
      name: "Chris Adeyemi",
      title: "Deployment Engineer, EMEA",
      kind: "peer_in_seat" as const,
      whyReachOut: "Peer in a Deployment Engineer seat — learn the craft loop.",
      relatedRoleTitle: "Deployment Engineer",
    },
    {
      companyId: cursor.id,
      name: "Sam Eng",
      title: "GTM, ANZ",
      kind: "adjacent" as const,
      whyReachOut: "ex-Vercel just joined Cursor ANZ GTM — warm path for SE intros.",
      relatedRoleTitle: "Sales Engineer",
      linkedInUrl: "https://x.com/example/status/seed-cursor-talent-1",
    },
    {
      companyId: cursor.id,
      name: "Jordan Lee",
      title: "Hiring Manager, Field Engineering",
      kind: "hiring_manager" as const,
      whyReachOut: "Owns Field/Sales Engineer hiring for APAC expansion.",
      relatedRoleTitle: "Field Engineer",
    },
    {
      companyId: fireworks.id,
      name: "Nina Brooks",
      title: "VP Solutions Engineering",
      kind: "hiring_manager" as const,
      whyReachOut: "Posted the first Sydney Solutions Engineer role.",
      relatedRoleTitle: "Solutions Engineer",
    },
    {
      companyId: fireworks.id,
      name: "Devon Shah",
      title: "Solutions Engineer, Singapore",
      kind: "peer_in_seat" as const,
      whyReachOut: "Closest peer SE in APAC — ask about Sydney ramp plan.",
      relatedRoleTitle: "Solutions Engineer",
    },
  ];

  for (const target of outreachSeeds) {
    await repo.upsertOutreachTarget(target);
  }

  await repo.createOpportunity({
    companyId: fireworks.id,
    headline: "[digest] Fireworks AI — first Sydney SE hire",
    score: 7.5,
    status: "new",
  });
  await repo.createOpportunity({
    companyId: decagon.id,
    headline: "[immediate] Decagon — Field Engineer Australia",
    score: 8.2,
    status: "new",
  });

  console.log(
    JSON.stringify(
      {
        companies: companies.map((c) => c.name),
        rawItemsInserted: rawInserted,
        openRoles: openRoleSeeds.length,
        outreachTargets: outreachSeeds.length,
        note: "Seed complete. Ask: “what roles fit me as an SE at Vercel?”",
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
