import { createHash } from "node:crypto";

import { canonicalizeJobUrl } from "./canonical-url.js";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Content hash for a job listing. Prefer canonical URL so cross-board
 * duplicates collapse; otherwise hash stable title/company/location fields.
 */
export function listingContentHash(input: {
  url?: string | null;
  title: string;
  company?: string | null;
  location?: string | null;
}): string {
  const canonical = canonicalizeJobUrl(input.url);
  if (canonical) {
    return sha256Hex(`job_listing:url:${canonical}`);
  }

  const title = input.title.trim().toLowerCase();
  const company = (input.company ?? "").trim().toLowerCase();
  const location = (input.location ?? "").trim().toLowerCase();
  return sha256Hex(`job_listing:fields:${company}|${title}|${location}`);
}
