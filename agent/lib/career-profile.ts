/**
 * Career profile module — structured, member-owned personalization state.
 *
 * Postgres is authoritative. Generated Markdown is an optional model-context
 * projection only. Explicit preferences always outrank inferred ones.
 */

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "./db/client.js";
import {
  careerProfiles,
  feedbackEvents,
  preferences,
  type PreferenceProvenance,
} from "./db/schema.js";
import type { MessagingDestination } from "./messaging.js";
import type { UserPreferences } from "./profile.js";
import {
  detectRoleFamily,
  extractGeographyHints,
  type CareerIdentity,
  type RoleFamilyId,
} from "./role-affinity.js";
import type { ScoreCompanyPrefs } from "./scoring.js";

export type ProfileConstraints = {
  locations?: string[];
  workAuthorization?: string[];
  compensationMin?: number | null;
  compensationCurrency?: string | null;
  remotePreference?: "remote" | "hybrid" | "onsite" | "flexible" | null;
  travelOk?: boolean | null;
  notes?: string | null;
};

export type ProfileGoals = {
  targetTitles?: string[];
  targetCompanies?: string[];
  ambitions?: string[];
};

export type ResumeIngest = {
  text: string;
  fileName?: string | null;
  ingestedAt: string;
  source: "paste" | "upload";
};

export type CareerProfileDocument = {
  roleFamily?: RoleFamilyId | string;
  geographyHints?: string[];
  interests?: string[];
  seniority?: string | null;
  name?: string | null;
  headline?: string | null;
  linkedInUrl?: string | null;
  goals?: ProfileGoals;
  constraints?: ProfileConstraints;
  messaging?: MessagingDestination;
  resume?: ResumeIngest | null;
  notes?: string | null;
};

export type PreferenceRecord = {
  key: string;
  value: unknown;
  provenance: PreferenceProvenance;
  confidence: number | null;
  sourceRef: string | null;
  active: boolean;
};

export type FeedbackRecord = {
  id: string;
  kind: string;
  subjectType: string;
  subjectId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type MemberContextSnapshot = {
  memberId: string;
  identity: CareerIdentity;
  document: CareerProfileDocument;
  preferences: UserPreferences;
  preferenceRows: PreferenceRecord[];
  recentFeedback: FeedbackRecord[];
  version: number;
  /** Optional Markdown projection for model context — not authoritative. */
  modelContextMarkdown: string;
};

export type ExplicitProfilePatch = {
  name?: string | null;
  headline?: string | null;
  currentTitle?: string | null;
  currentCompany?: string | null;
  location?: string | null;
  linkedInUrl?: string | null;
  seniority?: string | null;
  summary?: string | null;
  interests?: string[];
  goals?: ProfileGoals;
  constraints?: ProfileConstraints;
  notes?: string | null;
  messaging?: Partial<MessagingDestination>;
};

const SCORING_PREF_KEYS = [
  "preferHyperscalers",
  "avoidSeedStage",
  "ignoreCategories",
] as const;

function asDocument(value: unknown): CareerProfileDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as CareerProfileDocument;
}

function emptyMessaging(): MessagingDestination {
  return {
    telegramChatId: null,
    telegramUsername: null,
    linkedAt: null,
    consentUpdates: false,
    onboardingComplete: false,
  };
}

function defaultUserPreferences(): UserPreferences {
  return {
    preferHyperscalers: false,
    avoidSeedStage: false,
    ignoreCategories: [],
    rawFlags: {},
  };
}

/**
 * Resolve active preferences with explicit > imported > inferred precedence.
 */
export function resolveUserPreferences(
  rows: PreferenceRecord[],
): UserPreferences {
  const prefs = defaultUserPreferences();
  const rank: Record<PreferenceProvenance, number> = {
    inferred: 1,
    imported: 2,
    explicit: 3,
  };
  const winners = new Map<string, PreferenceRecord>();

  for (const row of rows) {
    if (!row.active) continue;
    const existing = winners.get(row.key);
    if (!existing || rank[row.provenance] >= rank[existing.provenance]) {
      winners.set(row.key, row);
    }
  }

  for (const [key, row] of winners) {
    prefs.rawFlags[key] = row.value as string | boolean | string[];
    if (key === "preferHyperscalers") {
      prefs.preferHyperscalers = Boolean(row.value);
    } else if (key === "avoidSeedStage") {
      prefs.avoidSeedStage = Boolean(row.value);
    } else if (key === "ignoreCategories") {
      prefs.ignoreCategories = Array.isArray(row.value)
        ? row.value.map(String)
        : String(row.value ?? "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);
    }
  }

  return prefs;
}

export function scoringPrefsFromSnapshot(
  snapshot: MemberContextSnapshot,
): ScoreCompanyPrefs {
  return {
    preferHyperscalers: snapshot.preferences.preferHyperscalers,
    avoidSeedStage: snapshot.preferences.avoidSeedStage,
    ignoreCategories: snapshot.preferences.ignoreCategories,
    roleFamily: snapshot.identity.roleFamily,
    geographyHints: snapshot.identity.geographyHints,
  };
}

function identityFromRow(
  row: {
    currentTitle: string | null;
    currentCompany: string | null;
    location: string | null;
    summary: string | null;
  },
  document: CareerProfileDocument,
): CareerIdentity {
  const currentTitle = row.currentTitle ?? undefined;
  const roleFamily =
    (document.roleFamily as RoleFamilyId | undefined) ??
    detectRoleFamily(currentTitle ?? document.headline ?? "");
  const geographyHints =
    document.geographyHints ??
    extractGeographyHints(
      row.location,
      document.headline,
      currentTitle,
      row.summary,
    );

  return {
    name: document.name ?? undefined,
    headline:
      document.headline ??
      (currentTitle && row.currentCompany
        ? `${currentTitle} at ${row.currentCompany}`
        : currentTitle),
    currentTitle,
    currentCompany: row.currentCompany ?? undefined,
    location: row.location ?? undefined,
    linkedInUrl: document.linkedInUrl ?? undefined,
    roleFamily,
    seniority: document.seniority ?? undefined,
    geographyHints,
    summary: row.summary ?? undefined,
  };
}

export function toModelContextMarkdown(
  snapshot: Omit<MemberContextSnapshot, "modelContextMarkdown">,
): string {
  const { identity, document, preferences, recentFeedback } = snapshot;
  const goals = document.goals ?? {};
  const constraints = document.constraints ?? {};
  const messaging = document.messaging ?? emptyMessaging();

  return [
    "# Member career context",
    "",
    "## Career Identity",
    `- Name: ${identity.name ?? ""}`,
    `- Headline: ${identity.headline ?? ""}`,
    `- Current title: ${identity.currentTitle ?? ""}`,
    `- Current company: ${identity.currentCompany ?? ""}`,
    `- Location: ${identity.location ?? ""}`,
    `- Role family: ${identity.roleFamily}`,
    `- Seniority: ${identity.seniority ?? ""}`,
    `- LinkedIn: ${identity.linkedInUrl ?? ""}`,
    `- Geography hints: ${(identity.geographyHints ?? []).join(", ")}`,
    `- Interests: ${(document.interests ?? []).join(", ")}`,
    identity.summary ? `- Summary: ${identity.summary}` : null,
    "",
    "## Goals",
    `- Target titles: ${(goals.targetTitles ?? []).join(", ")}`,
    `- Target companies: ${(goals.targetCompanies ?? []).join(", ")}`,
    `- Ambitions: ${(goals.ambitions ?? []).join(", ")}`,
    "",
    "## Constraints",
    `- Locations: ${(constraints.locations ?? []).join(", ")}`,
    `- Work authorization: ${(constraints.workAuthorization ?? []).join(", ")}`,
    `- Compensation min: ${constraints.compensationMin ?? ""} ${constraints.compensationCurrency ?? ""}`,
    `- Remote preference: ${constraints.remotePreference ?? ""}`,
    `- Travel OK: ${constraints.travelOk ?? ""}`,
    constraints.notes ? `- Notes: ${constraints.notes}` : null,
    "",
    "## Preferences (resolved; explicit beats inferred)",
    `- preferHyperscalers: ${preferences.preferHyperscalers}`,
    `- avoidSeedStage: ${preferences.avoidSeedStage}`,
    `- ignoreCategories: ${preferences.ignoreCategories.join(", ")}`,
    ...Object.entries(preferences.rawFlags)
      .filter(
        ([key]) =>
          !SCORING_PREF_KEYS.includes(
            key as (typeof SCORING_PREF_KEYS)[number],
          ),
      )
      .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`),
    "",
    "## Messaging",
    `- telegramChatId: ${messaging.telegramChatId ?? ""}`,
    `- telegramUsername: ${messaging.telegramUsername ? `@${messaging.telegramUsername}` : ""}`,
    `- consentUpdates: ${messaging.consentUpdates}`,
    `- onboardingComplete: ${messaging.onboardingComplete}`,
    "",
    document.resume?.text
      ? `## Résumé excerpt\n${document.resume.text.slice(0, 4000)}`
      : null,
    document.notes ? `## Notes\n${document.notes}` : null,
    recentFeedback.length
      ? [
          "## Recent feedback",
          ...recentFeedback.map(
            (event) =>
              `- [${event.createdAt.toISOString()}] ${event.kind} ${event.subjectType}${event.subjectId ? `:${event.subjectId}` : ""} ${JSON.stringify(event.payload)}`,
          ),
        ].join("\n")
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function loadPreferenceRows(
  memberId: string,
): Promise<PreferenceRecord[]> {
  const db = getDb();
  const rows = await db
    .select({
      key: preferences.key,
      value: preferences.value,
      provenance: preferences.provenance,
      confidence: preferences.confidence,
      sourceRef: preferences.sourceRef,
      active: preferences.active,
    })
    .from(preferences)
    .where(eq(preferences.memberId, memberId));
  return rows;
}

async function loadRecentFeedback(
  memberId: string,
  limit = 20,
): Promise<FeedbackRecord[]> {
  const db = getDb();
  return db
    .select({
      id: feedbackEvents.id,
      kind: feedbackEvents.kind,
      subjectType: feedbackEvents.subjectType,
      subjectId: feedbackEvents.subjectId,
      payload: feedbackEvents.payload,
      createdAt: feedbackEvents.createdAt,
    })
    .from(feedbackEvents)
    .where(eq(feedbackEvents.memberId, memberId))
    .orderBy(desc(feedbackEvents.createdAt))
    .limit(limit);
}

export async function getMemberContextSnapshot(
  memberId: string,
): Promise<MemberContextSnapshot> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(careerProfiles)
    .where(eq(careerProfiles.memberId, memberId))
    .limit(1);

  const document = asDocument(row?.profile);
  const preferenceRows = await loadPreferenceRows(memberId);
  const recentFeedback = await loadRecentFeedback(memberId);
  const resolvedPreferences = resolveUserPreferences(preferenceRows);
  const identity = identityFromRow(
    {
      currentTitle: row?.currentTitle ?? null,
      currentCompany: row?.currentCompany ?? null,
      location: row?.location ?? null,
      summary: row?.summary ?? null,
    },
    document,
  );

  const base = {
    memberId,
    identity,
    document: {
      ...document,
      messaging: document.messaging ?? emptyMessaging(),
    },
    preferences: resolvedPreferences,
    preferenceRows,
    recentFeedback,
    version: row?.version ?? 0,
  };

  return {
    ...base,
    modelContextMarkdown: toModelContextMarkdown(base),
  };
}

export async function applyExplicitProfileChanges(
  memberId: string,
  patch: ExplicitProfilePatch,
): Promise<MemberContextSnapshot> {
  const db = getDb();
  const existing = await getMemberContextSnapshot(memberId);
  const nextDocument: CareerProfileDocument = {
    ...existing.document,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.headline !== undefined ? { headline: patch.headline } : {}),
    ...(patch.linkedInUrl !== undefined
      ? { linkedInUrl: patch.linkedInUrl }
      : {}),
    ...(patch.seniority !== undefined ? { seniority: patch.seniority } : {}),
    ...(patch.interests !== undefined ? { interests: patch.interests } : {}),
    ...(patch.goals !== undefined
      ? { goals: { ...existing.document.goals, ...patch.goals } }
      : {}),
    ...(patch.constraints !== undefined
      ? {
          constraints: {
            ...existing.document.constraints,
            ...patch.constraints,
          },
        }
      : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.messaging !== undefined
      ? {
          messaging: {
            ...(existing.document.messaging ?? emptyMessaging()),
            ...patch.messaging,
            telegramUsername:
              patch.messaging.telegramUsername !== undefined
                ? patch.messaging.telegramUsername?.replace(/^@/, "") ?? null
                : (existing.document.messaging?.telegramUsername ?? null),
          },
        }
      : {}),
  };

  const currentTitle =
    patch.currentTitle !== undefined
      ? patch.currentTitle
      : existing.identity.currentTitle ?? null;
  const currentCompany =
    patch.currentCompany !== undefined
      ? patch.currentCompany
      : existing.identity.currentCompany ?? null;
  const location =
    patch.location !== undefined
      ? patch.location
      : existing.identity.location ?? null;
  const summary =
    patch.summary !== undefined
      ? patch.summary
      : existing.identity.summary ?? null;

  nextDocument.roleFamily = detectRoleFamily(
    [currentTitle, nextDocument.headline].filter(Boolean).join(" | "),
  );
  nextDocument.geographyHints = extractGeographyHints(
    location,
    nextDocument.headline,
    currentTitle,
    summary,
  );

  const [existingRow] = await db
    .select({ id: careerProfiles.id, version: careerProfiles.version })
    .from(careerProfiles)
    .where(eq(careerProfiles.memberId, memberId))
    .limit(1);

  if (existingRow) {
    await db
      .update(careerProfiles)
      .set({
        currentTitle,
        currentCompany,
        location,
        summary,
        profile: nextDocument,
        version: existingRow.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(careerProfiles.id, existingRow.id));
  } else {
    await db.insert(careerProfiles).values({
      memberId,
      currentTitle,
      currentCompany,
      location,
      summary,
      profile: nextDocument,
    });
  }

  return getMemberContextSnapshot(memberId);
}

export async function upsertPreference(input: {
  memberId: string;
  key: string;
  value: unknown;
  provenance: PreferenceProvenance;
  confidence?: number | null;
  sourceRef?: string | null;
  active?: boolean;
}): Promise<PreferenceRecord> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(preferences)
    .where(
      and(
        eq(preferences.memberId, input.memberId),
        eq(preferences.key, input.key),
        eq(preferences.provenance, input.provenance),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(preferences)
      .set({
        value: input.value,
        confidence: input.confidence ?? existing.confidence,
        sourceRef: input.sourceRef ?? existing.sourceRef,
        active: input.active ?? true,
        updatedAt: new Date(),
      })
      .where(eq(preferences.id, existing.id))
      .returning({
        key: preferences.key,
        value: preferences.value,
        provenance: preferences.provenance,
        confidence: preferences.confidence,
        sourceRef: preferences.sourceRef,
        active: preferences.active,
      });
    return updated!;
  }

  const [created] = await db
    .insert(preferences)
    .values({
      memberId: input.memberId,
      key: input.key,
      value: input.value,
      provenance: input.provenance,
      confidence: input.confidence ?? null,
      sourceRef: input.sourceRef ?? null,
      active: input.active ?? true,
    })
    .returning({
      key: preferences.key,
      value: preferences.value,
      provenance: preferences.provenance,
      confidence: preferences.confidence,
      sourceRef: preferences.sourceRef,
      active: preferences.active,
    });
  return created!;
}

export async function setExplicitPreference(
  memberId: string,
  key: string,
  value: unknown,
  sourceRef?: string,
): Promise<MemberContextSnapshot> {
  await upsertPreference({
    memberId,
    key,
    value,
    provenance: "explicit",
    confidence: 1,
    sourceRef: sourceRef ?? "member_correction",
  });
  await recordFeedback({
    memberId,
    kind: "preference_set",
    subjectType: "preference",
    subjectId: key,
    payload: { value, provenance: "explicit" },
  });
  return getMemberContextSnapshot(memberId);
}

export async function appendInferredPreference(input: {
  memberId: string;
  key: string;
  value: unknown;
  confidence: number;
  sourceRef: string;
}): Promise<MemberContextSnapshot> {
  // Never invent an inferred row that would silently beat an explicit value —
  // resolution still prefers explicit, but we still store the inference.
  await upsertPreference({
    memberId: input.memberId,
    key: input.key,
    value: input.value,
    provenance: "inferred",
    confidence: input.confidence,
    sourceRef: input.sourceRef,
  });
  return getMemberContextSnapshot(input.memberId);
}

export async function recordFeedback(input: {
  memberId: string;
  kind: string;
  subjectType: string;
  subjectId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<FeedbackRecord> {
  const db = getDb();
  const [created] = await db
    .insert(feedbackEvents)
    .values({
      memberId: input.memberId,
      kind: input.kind,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      payload: input.payload ?? {},
    })
    .returning({
      id: feedbackEvents.id,
      kind: feedbackEvents.kind,
      subjectType: feedbackEvents.subjectType,
      subjectId: feedbackEvents.subjectId,
      payload: feedbackEvents.payload,
      createdAt: feedbackEvents.createdAt,
    });
  return created!;
}

export async function ingestResumeText(input: {
  memberId: string;
  text: string;
  fileName?: string | null;
  source?: "paste" | "upload";
}): Promise<MemberContextSnapshot> {
  const text = input.text.trim();
  if (!text) {
    throw new Error("Résumé text is required");
  }

  const existing = await getMemberContextSnapshot(input.memberId);
  const db = getDb();
  const resume: ResumeIngest = {
    text,
    fileName: input.fileName ?? null,
    ingestedAt: new Date().toISOString(),
    source: input.source ?? "paste",
  };
  const next: CareerProfileDocument = {
    ...existing.document,
    resume,
  };

  const [row] = await db
    .select({ id: careerProfiles.id, version: careerProfiles.version })
    .from(careerProfiles)
    .where(eq(careerProfiles.memberId, input.memberId))
    .limit(1);

  if (row) {
    await db
      .update(careerProfiles)
      .set({
        profile: next,
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(careerProfiles.id, row.id));
  } else {
    await db.insert(careerProfiles).values({
      memberId: input.memberId,
      profile: next,
    });
  }

  await recordFeedback({
    memberId: input.memberId,
    kind: "resume_ingested",
    subjectType: "resume",
    subjectId: input.fileName ?? "paste",
    payload: { chars: text.length, source: input.source ?? "paste" },
  });

  return getMemberContextSnapshot(input.memberId);
}

export async function saveMessagingForMember(
  memberId: string,
  input: {
    telegramChatId?: string | null;
    telegramUsername?: string | null;
    consentUpdates?: boolean;
    onboardingComplete?: boolean;
    markLinked?: boolean;
  },
): Promise<MessagingDestination> {
  const snapshot = await getMemberContextSnapshot(memberId);
  const current = snapshot.document.messaging ?? emptyMessaging();
  const next: MessagingDestination = {
    telegramChatId:
      input.telegramChatId !== undefined
        ? input.telegramChatId
        : current.telegramChatId,
    telegramUsername:
      input.telegramUsername !== undefined
        ? input.telegramUsername?.replace(/^@/, "") ?? null
        : current.telegramUsername,
    linkedAt:
      input.markLinked ||
      (input.telegramChatId && input.telegramChatId !== current.telegramChatId)
        ? new Date().toISOString()
        : current.linkedAt,
    consentUpdates:
      input.consentUpdates !== undefined
        ? input.consentUpdates
        : current.consentUpdates,
    onboardingComplete:
      input.onboardingComplete !== undefined
        ? input.onboardingComplete
        : current.onboardingComplete,
  };

  await applyExplicitProfileChanges(memberId, { messaging: next });
  return next;
}

/** Parse free-form preference lines from the update_user_profile tool. */
export function parsePreferenceAssignments(
  text: string,
): Array<{ key: string; value: unknown }> {
  const assignments: Array<{ key: string; value: unknown }> = [];
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^[-*]?\s*([\w]+)\s*:\s*(.+)$/);
    if (!match) continue;
    const key = match[1]!;
    const raw = match[2]!.trim();
    if (raw.toLowerCase() === "true" || raw.toLowerCase() === "false") {
      assignments.push({ key, value: raw.toLowerCase() === "true" });
    } else if (key === "ignoreCategories") {
      assignments.push({
        key,
        value: raw
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      });
    } else {
      assignments.push({ key, value: raw });
    }
  }
  return assignments;
}
