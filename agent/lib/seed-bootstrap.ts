/**
 * Idempotent seed of gravy-train dossiers used by onboarding on cold starts
 * (e.g. empty /tmp SQLite on Vercel).
 */
import { ensureSchema } from "./db/client.js";
import { repo } from "./db/repo.js";

let seedPromise: Promise<void> | null = null;

export async function ensureSeedData(): Promise<{ seeded: boolean }> {
  await ensureSchema();
  const existing = await repo.listCompanies();
  if (existing.length > 0) {
    return { seeded: false };
  }

  if (!seedPromise) {
    seedPromise = seedCore().finally(() => {
      seedPromise = null;
    });
  }
  await seedPromise;
  return { seeded: true };
}

async function seedCore(): Promise<void> {
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

  const now = Date.now();
  const daysAgo = (n: number) =>
    new Date(now - n * 24 * 60 * 60 * 1000).toISOString();

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
    observedAt: daysAgo(2),
  });
  await repo.saveSignal({
    companyId: cursor.id,
    type: "talent_flow_strong_org",
    direction: "positive",
    strength: 4,
    summary: "ex-Vercel hire joining to scale GTM across ANZ.",
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

  const openRoleSeeds = [
    {
      companyId: fireworks.id,
      title: "Solutions Engineer",
      location: "Sydney, Australia",
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
    },
    {
      companyId: sierra.id,
      title: "Deployment Engineer",
      location: "APAC",
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

  const outreachSeeds = [
    {
      companyId: decagon.id,
      name: "Morgan Hale",
      title: "Head of GTM, APAC",
      kind: "hiring_manager" as const,
      whyReachOut:
        "Owns APAC GTM hiring; Field Engineer AU reports into this seat.",
      relatedRoleTitle: "Field Engineer",
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
}
