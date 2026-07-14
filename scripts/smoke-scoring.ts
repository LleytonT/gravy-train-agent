#!/usr/bin/env npx tsx
import { scoreCompany } from "../agent/lib/scoring.js";

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

console.log("smoke scoring ok");
