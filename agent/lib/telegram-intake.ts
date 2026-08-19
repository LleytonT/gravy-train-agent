/**
 * Telegram-first intake — durable state machine over the career profile.
 *
 * Answers persist immediately through `career-profile`. Re-/start resumes at
 * the first unanswered field. Not an in-memory conversation.
 */

import {
  applyExplicitProfileChanges,
  ingestResumeText,
  setExplicitPreference,
  type MemberContextSnapshot,
  type TelegramIntakeRecord,
  type TelegramIntakeStep,
} from "./career-profile.js";
import type { DigestCadence } from "./messaging.js";
import { saveMessagingDestination } from "./messaging.js";

export const INTAKE_STEPS: TelegramIntakeStep[] = [
  "identity",
  "target_roles",
  "company_thesis",
  "regions",
  "resume",
  "cadence",
];

const DEFAULT_REGIONS = ["APAC", "ANZ"];

export type IdentityParse = {
  name: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
};

export function parseIdentityFreeform(text: string): IdentityParse {
  const cleaned = text
    .replace(/^i['’]?m\s+/i, "")
    .replace(/^my name is\s+/i, "")
    .trim();
  if (!cleaned) {
    return { name: null, currentTitle: null, currentCompany: null };
  }

  const atMatch =
    /^(.*?)[,—–\-]\s*(.+?)\s+(?:at|@)\s+(.+)$/iu.exec(cleaned) ??
    /^(.+?)\s+(?:at|@)\s+(.+)$/iu.exec(cleaned);

  if (atMatch && atMatch.length === 4) {
    return {
      name: tidyName(atMatch[1]!),
      currentTitle: tidyTitle(atMatch[2]!),
      currentCompany: tidyCompany(atMatch[3]!),
    };
  }
  if (atMatch && atMatch.length === 3) {
    return {
      name: null,
      currentTitle: tidyTitle(atMatch[1]!),
      currentCompany: tidyCompany(atMatch[2]!),
    };
  }

  const parts = cleaned
    .split(/[,—–|/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    return {
      name: tidyName(parts[0]!),
      currentTitle: tidyTitle(parts[1]!),
      currentCompany: tidyCompany(parts[2]!),
    };
  }
  if (parts.length === 2) {
    return {
      name: tidyName(parts[0]!),
      currentTitle: tidyTitle(parts[1]!),
      currentCompany: null,
    };
  }

  return { name: tidyName(cleaned), currentTitle: null, currentCompany: null };
}

function tidyName(value: string): string | null {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

function tidyTitle(value: string): string | null {
  return tidyName(value);
}

function tidyCompany(value: string): string | null {
  return tidyName(value.replace(/\.$/, ""));
}

export function parseCommaList(text: string): string[] {
  return text
    .split(/[,;/]+|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseRegions(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/^(here|local|same|this region)$/i.test(trimmed)) {
    return [...DEFAULT_REGIONS];
  }
  if (/^(apac|anz|au\/?nz|australia|sydney)$/i.test(trimmed)) {
    return [...DEFAULT_REGIONS];
  }
  const parts = parseCommaList(trimmed);
  return parts.length > 0 ? parts : [trimmed];
}

export function isSkipResume(text: string): boolean {
  return /^(later|skip|no|not now|none|n\/a)$/i.test(text.trim());
}

export function parseCadence(text: string): DigestCadence | null {
  const t = text.trim().toLowerCase();
  if (t === "realtime" || t === "real-time" || t === "real time" || t === "now") {
    return "realtime";
  }
  if (t === "daily" || t === "day") return "daily";
  if (t === "weekly" || t === "week") return "weekly";
  return null;
}

export function unresolvedIntakeStep(
  snapshot: MemberContextSnapshot,
): TelegramIntakeStep {
  const identity = snapshot.identity;
  if (
    !identity.name?.trim() ||
    !identity.currentTitle?.trim() ||
    !identity.currentCompany?.trim()
  ) {
    return "identity";
  }
  if (!(snapshot.document.goals?.targetTitles?.length)) {
    return "target_roles";
  }
  if (
    !snapshot.document.companyThesis?.trim() &&
    !(snapshot.document.goals?.ambitions?.length)
  ) {
    return "company_thesis";
  }
  if (!(snapshot.document.constraints?.locations?.length)) {
    return "regions";
  }
  if (!snapshot.document.resume?.text && !snapshot.document.intake?.skippedResume) {
    return "resume";
  }
  const cadence =
    snapshot.document.messaging?.digestCadence ??
    cadenceFromPreferences(snapshot);
  if (!cadence) return "cadence";
  return "complete";
}

function cadenceFromPreferences(
  snapshot: MemberContextSnapshot,
): DigestCadence | null {
  const row = snapshot.preferenceRows.find(
    (item) => item.active && item.key === "digestCadence",
  );
  const value = row?.value;
  if (value === "realtime" || value === "daily" || value === "weekly") {
    return value;
  }
  return null;
}

export function isIntakeComplete(snapshot: MemberContextSnapshot): boolean {
  if (snapshot.document.intake?.status === "complete") return true;
  if (snapshot.document.messaging?.onboardingComplete) return true;
  return unresolvedIntakeStep(snapshot) === "complete";
}

export function intakeQuestion(step: TelegramIntakeStep): string | null {
  switch (step) {
    case "identity":
      return "What's your name and current role — e.g. 'Alex, Sales Engineer at Vercel'?";
    case "target_roles":
      return "Which roles should I watch for? e.g. Sales Engineer, Field Engineer.";
    case "company_thesis":
      return "What kinds of companies — stage and industry? e.g. AI-native, Series A+.";
    case "regions":
      return "Which regions? Say 'here' for APAC/ANZ, or name them.";
    case "resume":
      return "Paste a résumé, send a PDF/docx, or say 'later' to skip.";
    case "cadence":
      return "How often should I ping you?";
    case "complete":
      return null;
  }
}

export function cadenceKeyboard(): Record<string, unknown> {
  return {
    inline_keyboard: [
      [
        { text: "Realtime", callback_data: "gs:c:rt" },
        { text: "Daily", callback_data: "gs:c:da" },
        { text: "Weekly", callback_data: "gs:c:we" },
      ],
    ],
  };
}

export async function persistIntakeCursor(
  memberId: string,
  snapshot: MemberContextSnapshot,
  extra?: Partial<TelegramIntakeRecord>,
): Promise<MemberContextSnapshot> {
  const step = unresolvedIntakeStep(snapshot);
  const intake: TelegramIntakeRecord = {
    status: step === "complete" ? "complete" : "in_progress",
    currentStep: step,
    skippedResume: snapshot.document.intake?.skippedResume,
    awaitingUpload: snapshot.document.intake?.awaitingUpload ?? null,
    ...extra,
  };
  return applyExplicitProfileChanges(memberId, { intake });
}

export async function applyIdentityAnswer(
  memberId: string,
  text: string,
): Promise<{ snapshot: MemberContextSnapshot; error?: string }> {
  const parsed = parseIdentityFreeform(text);
  if (!parsed.name || !parsed.currentTitle || !parsed.currentCompany) {
    return {
      snapshot: await applyExplicitProfileChanges(memberId, {
        name: parsed.name,
        currentTitle: parsed.currentTitle,
        currentCompany: parsed.currentCompany,
        headline:
          parsed.currentTitle && parsed.currentCompany
            ? `${parsed.currentTitle} at ${parsed.currentCompany}`
            : undefined,
      }),
      error:
        "I need name, title, and company in one line — e.g. 'Alex, Sales Engineer at Vercel'.",
    };
  }
  const snapshot = await applyExplicitProfileChanges(memberId, {
    name: parsed.name,
    currentTitle: parsed.currentTitle,
    currentCompany: parsed.currentCompany,
    headline: `${parsed.currentTitle} at ${parsed.currentCompany}`,
  });
  return { snapshot: await persistIntakeCursor(memberId, snapshot) };
}

export async function applyTargetRolesAnswer(
  memberId: string,
  text: string,
): Promise<{ snapshot: MemberContextSnapshot; error?: string }> {
  const titles = parseCommaList(text);
  if (titles.length === 0) {
    return {
      snapshot: await applyExplicitProfileChanges(memberId, {}),
      error: "Name at least one target role, comma-separated.",
    };
  }
  const snapshot = await applyExplicitProfileChanges(memberId, {
    goals: { targetTitles: titles },
  });
  return { snapshot: await persistIntakeCursor(memberId, snapshot) };
}

export async function applyCompanyThesisAnswer(
  memberId: string,
  text: string,
): Promise<{ snapshot: MemberContextSnapshot; error?: string }> {
  const thesis = text.trim();
  if (!thesis) {
    return {
      snapshot: await applyExplicitProfileChanges(memberId, {}),
      error: "A short company thesis helps — stage and industry is enough.",
    };
  }
  const snapshot = await applyExplicitProfileChanges(memberId, {
    companyThesis: thesis,
    goals: { ambitions: [thesis] },
  });
  return { snapshot: await persistIntakeCursor(memberId, snapshot) };
}

export async function applyRegionsAnswer(
  memberId: string,
  text: string,
): Promise<{ snapshot: MemberContextSnapshot; error?: string }> {
  const locations = parseRegions(text);
  if (locations.length === 0) {
    return {
      snapshot: await applyExplicitProfileChanges(memberId, {}),
      error: "Name a region, or say 'here' for APAC/ANZ.",
    };
  }
  const snapshot = await applyExplicitProfileChanges(memberId, {
    constraints: { locations },
    location: locations.join(", "),
  });
  return { snapshot: await persistIntakeCursor(memberId, snapshot) };
}

export async function applyResumeAnswer(
  memberId: string,
  input: { text?: string; fileName?: string | null; source?: "paste" | "upload" },
): Promise<{ snapshot: MemberContextSnapshot; error?: string }> {
  const text = input.text?.trim() ?? "";
  if (text && isSkipResume(text) && !input.fileName) {
    const existing = await applyExplicitProfileChanges(memberId, {});
    const snapshot = await persistIntakeCursor(memberId, existing, {
      skippedResume: true,
    });
    return { snapshot };
  }
  if (text.length < 40) {
    return {
      snapshot: await applyExplicitProfileChanges(memberId, {}),
      error:
        "That résumé looks too short. Paste more text, send a PDF/docx, or say 'later'.",
    };
  }
  const ingested = await ingestResumeText({
    memberId,
    text,
    fileName: input.fileName,
    source: input.source ?? "paste",
  });
  return { snapshot: await persistIntakeCursor(memberId, ingested) };
}

export async function applyCadenceAnswer(
  memberId: string,
  cadence: DigestCadence,
): Promise<MemberContextSnapshot> {
  await setExplicitPreference(
    memberId,
    "digestCadence",
    cadence,
    "telegram_intake",
  );
  await saveMessagingDestination(memberId, {
    digestCadence: cadence,
    consentUpdates: true,
    onboardingComplete: true,
  });
  const snapshot = await applyExplicitProfileChanges(memberId, {
    intake: {
      status: "complete",
      currentStep: "complete",
      skippedResume: undefined,
      awaitingUpload: null,
    },
  });
  return persistIntakeCursor(memberId, snapshot, {
    status: "complete",
    currentStep: "complete",
    awaitingUpload: null,
  });
}

export function confirmationSummary(snapshot: MemberContextSnapshot): string {
  const identity = snapshot.identity;
  const titles = snapshot.document.goals?.targetTitles ?? [];
  const thesis =
    snapshot.document.companyThesis ??
    snapshot.document.goals?.ambitions?.[0] ??
    "—";
  const regions = snapshot.document.constraints?.locations ?? [];
  const cadence =
    snapshot.document.messaging?.digestCadence ??
    cadenceFromPreferences(snapshot) ??
    "daily";
  const resume = snapshot.document.resume?.text
    ? "saved"
    : snapshot.document.intake?.skippedResume
      ? "later"
      : "—";
  return [
    `You're in. ${identity.name ?? "Member"} — ${identity.currentTitle ?? "role"} at ${identity.currentCompany ?? "company"}.`,
    `Watching: ${titles.join(", ") || "—"}.`,
    `Thesis: ${thesis}.`,
    `Regions: ${regions.join(", ") || "APAC/ANZ"}.`,
    `Résumé: ${resume}. Cadence: ${cadence}.`,
    "I'll message you when the next scan runs. Try /opportunities to see what I have already.",
  ].join("\n");
}
