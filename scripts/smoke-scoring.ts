#!/usr/bin/env npx tsx
import { scoreCompany } from "../agent/lib/scoring.js";
import { detectRoleFamily, titleAffinityScore } from "../agent/lib/role-affinity.js";
import { buildRoleRecommendations } from "../agent/lib/personalize.js";
import type { Company, Signal } from "../agent/lib/db/schema.js";

const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString();

const compound = scoreCompany([
  {
    type: "exec_tour",
    direction: "positive",
    strength: 4,
    summary: "CEO in Sydney",
    observedAt: daysAgo(2),
  },
  {
    type: "sydney_infra",
    direction: "positive",
    strength: 4,
    summary: "Sydney region chatter",
    observedAt: daysAgo(5),
  },
  {
    type: "apac_sales_leadership_hire",
    direction: "positive",
    strength: 5,
    summary: "Hired VP APAC Sales",
    observedAt: daysAgo(1),
  },
]);

console.log("compound", compound);
if (compound.pingTier !== "immediate") {
  throw new Error(`expected immediate, got ${compound.pingTier}`);
}
if (compound.score < 5) {
  throw new Error(`expected strong score, got ${compound.score}`);
}
if (compound.timing < 4) {
  throw new Error(`expected timing 4 for compound, got ${compound.timing}`);
}

const ignore = scoreCompany(
  [
    {
      type: "funding_round",
      direction: "positive",
      strength: 3,
      summary: "Raised seed",
      observedAt: daysAgo(1),
    },
  ],
  { watchlistTier: "ignore" },
);
if (ignore.pingTier !== "none") {
  throw new Error(`ignore tier should not ping, got ${ignore.pingTier}`);
}

// Role family detection for SE @ Vercel AU
const family = detectRoleFamily("Sales Engineer at Vercel | APAC");
if (family !== "sales_engineer") {
  throw new Error(`expected sales_engineer, got ${family}`);
}
if (titleAffinityScore("Field Engineer", "sales_engineer") < 0.7) {
  throw new Error("Field Engineer should affinity-match sales_engineer");
}
if (titleAffinityScore("Deployment Engineer", "sales_engineer") < 0.7) {
  throw new Error("Deployment Engineer should affinity-match sales_engineer");
}

const personalized = scoreCompany(
  [
    {
      type: "adjacent_se_csm",
      direction: "positive",
      strength: 5,
      summary: "Field Engineer Australia seat",
      observedAt: daysAgo(1),
    },
    {
      type: "first_apac_gtm_job",
      direction: "positive",
      strength: 5,
      summary: "First APAC GTM job",
      observedAt: daysAgo(1),
    },
  ],
  {
    roleFamily: "sales_engineer",
    geographyHints: ["australia", "sydney"],
    companyName: "Decagon",
  },
);

const baseline = scoreCompany([
  {
    type: "adjacent_se_csm",
    direction: "positive",
    strength: 5,
    summary: "Field Engineer Australia seat",
    observedAt: daysAgo(1),
  },
  {
    type: "first_apac_gtm_job",
    direction: "positive",
    strength: 5,
    summary: "First APAC GTM job",
    observedAt: daysAgo(1),
  },
]);

if (personalized.score <= baseline.score) {
  throw new Error(
    `expected role/geo personalization bump (${personalized.score} vs ${baseline.score})`,
  );
}
console.log("personalized bump", { personalized: personalized.score, baseline: baseline.score });

const companies = [
  {
    id: "decagon",
    name: "Decagon",
    aliases: "[]",
    website: null,
    category: "ai-cx",
    watchlistTier: "hot",
    createdAt: daysAgo(30),
    updatedAt: daysAgo(1),
  },
  {
    id: "sierra",
    name: "Sierra",
    aliases: "[]",
    website: null,
    category: "ai-agents",
    watchlistTier: "hot",
    createdAt: daysAgo(30),
    updatedAt: daysAgo(1),
  },
  {
    id: "cursor",
    name: "Cursor",
    aliases: "[]",
    website: null,
    category: "devtools",
    watchlistTier: "hot",
    createdAt: daysAgo(30),
    updatedAt: daysAgo(1),
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    aliases: "[]",
    website: null,
    category: "ai-infra",
    watchlistTier: "hot",
    createdAt: daysAgo(30),
    updatedAt: daysAgo(1),
  },
  {
    id: "vercel",
    name: "Vercel",
    aliases: "[]",
    website: null,
    category: "devtools",
    watchlistTier: "warm",
    createdAt: daysAgo(30),
    updatedAt: daysAgo(1),
  },
] as Company[];

const signalsByCompany = new Map<string, Signal[]>([
  [
    "decagon",
    [
      {
        id: "1",
        companyId: "decagon",
        type: "adjacent_se_csm",
        direction: "positive",
        strength: 5,
        summary: "Field Engineer Australia",
        sourceUrl: null,
        excerpt: null,
        observedAt: daysAgo(1),
        createdAt: daysAgo(1),
      },
    ],
  ],
  [
    "sierra",
    [
      {
        id: "2",
        companyId: "sierra",
        type: "adjacent_se_csm",
        direction: "positive",
        strength: 5,
        summary: "Deployment Engineer APAC",
        sourceUrl: null,
        excerpt: null,
        observedAt: daysAgo(2),
        createdAt: daysAgo(2),
      },
    ],
  ],
  [
    "cursor",
    [
      {
        id: "3",
        companyId: "cursor",
        type: "talent_flow_strong_org",
        direction: "positive",
        strength: 4,
        summary: "ex-Vercel joining ANZ GTM",
        sourceUrl: null,
        excerpt: null,
        observedAt: daysAgo(3),
        createdAt: daysAgo(3),
      },
    ],
  ],
  [
    "fireworks",
    [
      {
        id: "4",
        companyId: "fireworks",
        type: "adjacent_se_csm",
        direction: "positive",
        strength: 5,
        summary: "Sydney Solutions Engineer",
        sourceUrl: null,
        excerpt: null,
        observedAt: daysAgo(2),
        createdAt: daysAgo(2),
      },
    ],
  ],
]);

const scoresByCompany = new Map(
  companies.map((c) => [
    c.id,
    scoreCompany(signalsByCompany.get(c.id) ?? [], {
      roleFamily: "sales_engineer",
      geographyHints: ["australia", "sydney", "apac"],
      companyName: c.name,
      watchlistTier: c.watchlistTier,
    }),
  ]),
);

const recs = buildRoleRecommendations({
  profileMarkdown: `## Career Identity
- Current title: Sales Engineer
- Current company: Vercel
- Location: Sydney, Australia
- Role family: sales_engineer
- Geography hints: australia, sydney, apac
`,
  companies,
  signalsByCompany,
  scoresByCompany,
  openRoles: [
    {
      companyId: "decagon",
      companyName: "Decagon",
      title: "Field Engineer",
      location: "Sydney",
    },
    {
      companyId: "sierra",
      companyName: "Sierra",
      title: "Deployment Engineer",
      location: "APAC",
    },
    {
      companyId: "cursor",
      companyName: "Cursor",
      title: "Sales Engineer",
      location: "Australia",
    },
    {
      companyId: "fireworks",
      companyName: "Fireworks AI",
      title: "Solutions Engineer",
      location: "Sydney",
    },
  ],
});

const names = recs.recommendations.map((r) => r.companyName);
console.log("recommendations", names);
if (names.includes("Vercel")) {
  throw new Error("should not recommend current employer Vercel");
}
for (const expected of ["Decagon", "Sierra", "Cursor", "Fireworks AI"]) {
  if (!names.includes(expected)) {
    throw new Error(`expected ${expected} in recommendations, got ${names.join(", ")}`);
  }
}

console.log("smoke scoring + personalization ok");
