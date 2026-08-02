/**
 * Legacy Markdown profile helpers.
 *
 * GS-003 moved authoritative member state to `agent/lib/career-profile.ts`
 * (Postgres). Prefer that module from tools and product code. These helpers
 * remain for local capture scripts and deterministic scoring smoke tests that
 * still pass Markdown strings into personalize/scoring.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { resolveRuntimeProfilePath } from "./runtime-paths.js";

export function getProfilePath(): string {
  const configured = resolveRuntimeProfilePath(process.env.USER_PROFILE_PATH);
  return configured.startsWith("/")
    ? configured
    : resolve(process.cwd(), configured);
}

export function readUserProfile(): string {
  const profilePath = getProfilePath();

  try {
    return readFileSync(profilePath, "utf8");
  } catch {
    mkdirSync(dirname(profilePath), { recursive: true });
    const defaultProfile = [
      "# User Profile",
      "",
      "## Preferences",
      "- preferHyperscalers: false",
      "- avoidSeedStage: false",
      "- ignoreCategories: ",
      "",
      "## Notes",
      "",
    ].join("\n");
    writeFileSync(profilePath, defaultProfile, "utf8");
    return defaultProfile;
  }
}

export type UserPreferences = {
  preferHyperscalers: boolean;
  avoidSeedStage: boolean;
  ignoreCategories: string[];
  rawFlags: Record<string, string | boolean | string[]>;
};

export function parsePreferences(profileMarkdown: string): UserPreferences {
  const prefs: UserPreferences = {
    preferHyperscalers: false,
    avoidSeedStage: false,
    ignoreCategories: [],
    rawFlags: {},
  };

  const lines = profileMarkdown.split("\n");
  let inPreferences = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^##\s+preferences/i.test(trimmed)) {
      inPreferences = true;
      continue;
    }

    if (inPreferences && /^##\s+/.test(trimmed)) {
      break;
    }

    if (!inPreferences) {
      continue;
    }

    const match = trimmed.match(/^[-*]\s*([\w]+)\s*:\s*(.*)$/i);
    if (!match) {
      continue;
    }

    const key = match[1]!;
    const rawValue = match[2]!.trim();

    if (key === "preferHyperscalers") {
      prefs.preferHyperscalers = rawValue.toLowerCase() === "true";
      prefs.rawFlags[key] = prefs.preferHyperscalers;
      continue;
    }

    if (key === "avoidSeedStage") {
      prefs.avoidSeedStage = rawValue.toLowerCase() === "true";
      prefs.rawFlags[key] = prefs.avoidSeedStage;
      continue;
    }

    if (key === "ignoreCategories") {
      prefs.ignoreCategories = rawValue
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      prefs.rawFlags[key] = prefs.ignoreCategories;
      continue;
    }

    if (rawValue.toLowerCase() === "true" || rawValue.toLowerCase() === "false") {
      prefs.rawFlags[key] = rawValue.toLowerCase() === "true";
    } else {
      prefs.rawFlags[key] = rawValue;
    }
  }

  return prefs;
}

export type UpdateUserProfileInput =
  | { append: string; replaceSection?: never; setContent?: never }
  | { replaceSection: { heading: string; content: string }; append?: never; setContent?: never }
  | { setContent: string; append?: never; replaceSection?: never };

export function updateUserProfile(input: UpdateUserProfileInput): string {
  const profilePath = getProfilePath();
  mkdirSync(dirname(profilePath), { recursive: true });

  if ("setContent" in input && input.setContent !== undefined) {
    writeFileSync(profilePath, input.setContent, "utf8");
    return input.setContent;
  }

  const current = readUserProfile();

  if ("append" in input && input.append !== undefined) {
    const separator = current.endsWith("\n") ? "" : "\n";
    const next = `${current}${separator}${input.append}`;
    writeFileSync(profilePath, next, "utf8");
    return next;
  }

  if ("replaceSection" in input && input.replaceSection !== undefined) {
    const { heading, content } = input.replaceSection;
    const headingPattern = new RegExp(
      `(^##\\s+${escapeRegExp(heading)}\\s*$)([\\s\\S]*?)(?=^##\\s+|\\Z)`,
      "im",
    );

    const normalizedContent = content.trim();
    const replacement = `## ${heading}\n\n${normalizedContent}\n`;

    const next = headingPattern.test(current)
      ? current.replace(headingPattern, replacement)
      : `${current.trimEnd()}\n\n${replacement}`;

    writeFileSync(profilePath, next, "utf8");
    return next;
  }

  return current;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
