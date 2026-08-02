#!/usr/bin/env node
/**
 * CLI: capture the logged-in user's LinkedIn profile into the local Markdown
 * projection file. Product personalization uses the Postgres career profile
 * module (`agent/lib/career-profile.ts`); after capture, paste fields via chat
 * `ingest_linkedin_profile` or onboarding for the authenticated member.
 *
 * Usage:
 *   tsx capture/run-profile-capture.ts [--dry-run] [--headed] [--url=https://www.linkedin.com/in/...]
 */

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { captureLinkedInProfile } from "./linkedin-profile.js";
import { CaptureAbortError } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({
  path: [
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", ".env"),
  ],
});

interface CliOptions {
  dryRun: boolean;
  headed: boolean;
  profileUrl?: string;
}

function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  let headed = false;
  let profileUrl: string | undefined;

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--headed") headed = true;
    else if (arg.startsWith("--url=")) profileUrl = arg.slice("--url=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Gravy Scout LinkedIn profile capture (read-only)

Usage:
  tsx capture/run-profile-capture.ts [options]

Options:
  --dry-run     Print profile JSON without writing user-profile.md
  --headed      Show browser (needed for first login)
  --url=...     Explicit profile URL (default: /in/me/)
  --help, -h
`);
      process.exit(0);
    }
  }

  return { dryRun, headed, profileUrl };
}

async function persistProfile(
  profile: Awaited<ReturnType<typeof captureLinkedInProfile>>,
): Promise<void> {
  const { formatCareerIdentitySection, detectRoleFamily, extractGeographyHints } =
    await import("../agent/lib/role-affinity.js");
  const { updateUserProfile } = await import("../agent/lib/profile.js");

  const roleFamily = detectRoleFamily(
    [profile.currentTitle, profile.headline].filter(Boolean).join(" | "),
  );
  const geographyHints = extractGeographyHints(
    profile.location,
    profile.headline,
    profile.currentTitle,
    profile.summary,
  );

  const section = formatCareerIdentitySection({
    name: profile.name ?? undefined,
    headline: profile.headline ?? undefined,
    currentTitle: profile.currentTitle ?? undefined,
    currentCompany: profile.currentCompany ?? undefined,
    location: profile.location ?? undefined,
    linkedInUrl: profile.linkedInUrl ?? undefined,
    roleFamily,
    geographyHints,
    summary: profile.summary ?? undefined,
  });

  updateUserProfile({
    replaceSection: { heading: "Career Identity", content: section },
  });

  const roleToday =
    profile.currentTitle && profile.currentCompany
      ? `${profile.currentTitle} at ${profile.currentCompany}`
      : profile.currentTitle ?? profile.currentCompany ?? "";

  updateUserProfile({
    replaceSection: {
      heading: "Identity",
      content: [
        `- Name: ${profile.name ?? ""}`,
        `- WhatsApp: _(unchanged unless you tell me)_`,
        `- Location: ${profile.location ?? ""}`,
        `- Role today: ${roleToday}`,
      ].join("\n"),
    },
  });

  updateUserProfile({
    replaceSection: {
      heading: "Targeting",
      content: [
        `- Role: ${profile.currentTitle ?? ""}`,
        `- Geography: ${profile.location ?? ""}`,
        `- Background: _(from LinkedIn — refine via chat)_`,
        `- Role family: ${roleFamily}`,
      ].join("\n"),
    },
  });
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `[profile-capture] starting dryRun=${opts.dryRun} headed=${opts.headed}`,
  );

  try {
    const profile = await captureLinkedInProfile({
      dryRun: opts.dryRun,
      headless: !opts.headed,
      profileUrl: opts.profileUrl,
    });

    console.log(JSON.stringify(profile, null, 2));

    if (opts.dryRun) {
      console.log("[dry-run] not writing user-profile.md");
      return;
    }

    await persistProfile(profile);
    console.log("[profile-capture] wrote Career Identity to user-profile.md");
  } catch (err) {
    if (err instanceof CaptureAbortError) {
      console.error(`[profile-capture] ABORT: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error("[profile-capture] fatal:", err);
  process.exit(1);
});
