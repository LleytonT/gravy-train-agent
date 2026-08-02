/**
 * First-run onboarding: persist Career Identity + return personalized matches.
 * Used by POST /api/onboarding (no LLM required).
 *
 * On Vercel serverless, profile/DB writes go under /tmp and seed data is
 * bootstrapped when empty. Profile persistence is best-effort — the kickoff
 * message tells the Eve agent to call ingest_linkedin_profile into its sandbox.
 */

import { eq } from "drizzle-orm";

import { ensureSchema, getDb } from "./db/client.js";
import { careerProfiles } from "./db/schema.js";
import { repo } from "./db/repo.js";
import type { OnboardingInput, OnboardingMatch } from "./onboarding-types.js";
import {
  buildRoleRecommendations,
  pickOutreachForRecommendation,
  suggestOutreachAngles,
  type OutreachTargetInput,
} from "./personalize.js";
import {
  saveMessagingDestination,
  telegramDeepLink,
} from "./messaging.js";
import {
  parsePreferences,
  readUserProfile,
  updateUserProfile,
} from "./profile.js";
import {
  detectRoleFamily,
  extractGeographyHints,
  formatCareerIdentitySection,
  type CareerIdentity,
} from "./role-affinity.js";
import { scoreCompany } from "./scoring.js";

export type { OnboardingInput, OnboardingMatch } from "./onboarding-types.js";

export type OnboardingResult = {
  identity: CareerIdentity;
  matches: OnboardingMatch[];
  kickoffMessage: string;
  profilePersisted: boolean;
};

function tryPersistProfile(
  identity: CareerIdentity,
  interests?: string[],
  messaging?: {
    telegramUsername?: string;
    consentUpdates?: boolean;
  },
): boolean {
  try {
    updateUserProfile({
      replaceSection: {
        heading: "Career Identity",
        content: formatCareerIdentitySection(identity),
      },
    });

    const roleToday = `${identity.currentTitle} at ${identity.currentCompany}`;
    updateUserProfile({
      replaceSection: {
        heading: "Identity",
        content: [
          `- Name: ${identity.name ?? ""}`,
          `- WhatsApp: _(optional)_`,
          `- Location: ${identity.location}`,
          `- Role today: ${roleToday}`,
        ].join("\n"),
      },
    });

    updateUserProfile({
      replaceSection: {
        heading: "Targeting",
        content: [
          `- Role: ${identity.currentTitle}`,
          `- Geography: ${identity.location}`,
          `- Background: _(refine via chat)_`,
          `- Role family: ${identity.roleFamily}`,
        ].join("\n"),
      },
    });

    if (interests?.length) {
      updateUserProfile({
        replaceSection: {
          heading: "Interests",
          content: [
            `- Strong: ${interests.join(", ")}`,
            `- Also open: _(tell me as we explore)_`,
            `- Seed watchlist companies: Modal, Fireworks AI, Cursor, ElevenLabs, Decagon, Sierra`,
            `- People-watchlist: _(add as we explore)_`,
          ].join("\n"),
        },
      });
    }

    saveMessagingDestination({
      telegramUsername: messaging?.telegramUsername,
      consentUpdates: messaging?.consentUpdates ?? false,
      onboardingComplete: false,
    });

    // Touch-read to confirm path is usable for preference parsing
    readUserProfile();
    return true;
  } catch (err) {
    console.warn(
      "[onboarding] profile persist skipped:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

async function upsertCareerProfileStub(
  memberId: string,
  identity: CareerIdentity,
  interests?: string[],
): Promise<void> {
  const db = getDb();
  const profile = {
    roleFamily: identity.roleFamily,
    geographyHints: identity.geographyHints,
    interests: interests ?? [],
    seniority: identity.seniority ?? null,
  };
  const existing = await db
    .select({ id: careerProfiles.id, version: careerProfiles.version })
    .from(careerProfiles)
    .where(eq(careerProfiles.memberId, memberId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(careerProfiles)
      .set({
        currentTitle: identity.currentTitle,
        currentCompany: identity.currentCompany,
        location: identity.location,
        summary: identity.summary ?? null,
        profile,
        version: existing[0].version + 1,
        updatedAt: new Date(),
      })
      .where(eq(careerProfiles.id, existing[0].id));
    return;
  }

  await db.insert(careerProfiles).values({
    memberId,
    currentTitle: identity.currentTitle,
    currentCompany: identity.currentCompany,
    location: identity.location,
    summary: identity.summary ?? null,
    profile,
  });
}

export async function completeOnboarding(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  await ensureSchema();

  if (!input.memberId?.trim()) {
    throw new Error("Authenticated memberId is required for onboarding");
  }

  const roleFamily = detectRoleFamily(input.currentTitle);
  const geographyHints = extractGeographyHints(
    input.location,
    input.currentTitle,
    input.currentCompany,
  );
  const headline = `${input.currentTitle} at ${input.currentCompany}`;
  const identity: CareerIdentity = {
    name: input.name?.trim() || undefined,
    headline,
    currentTitle: input.currentTitle.trim(),
    currentCompany: input.currentCompany.trim(),
    location: input.location.trim(),
    roleFamily,
    seniority: input.seniority,
    geographyHints,
    summary: input.interests?.length
      ? `Interests: ${input.interests.join(", ")}`
      : undefined,
  };

  const profilePersisted = tryPersistProfile(identity, input.interests, {
    telegramUsername: input.telegramUsername,
    consentUpdates: input.consentUpdates,
  });

  try {
    await upsertCareerProfileStub(input.memberId, identity, input.interests);
  } catch (err) {
    console.warn(
      "[onboarding] career profile stub skipped:",
      err instanceof Error ? err.message : err,
    );
  }

  let profileMarkdown = "";
  try {
    profileMarkdown = readUserProfile();
  } catch {
    profileMarkdown = [
      "## Career Identity",
      formatCareerIdentitySection(identity),
      "",
      "## Preferences",
      "- preferHyperscalers: false",
      "- avoidSeedStage: false",
      "- ignoreCategories: ",
    ].join("\n");
  }

  const prefs = parsePreferences(profileMarkdown);
  const companies = await repo.listCompanies();
  const signalsByCompany = new Map();
  const scoresByCompany = new Map();

  for (const c of companies) {
    const signals = await repo.getSignalsForCompany(c.id);
    signalsByCompany.set(c.id, signals);
    scoresByCompany.set(
      c.id,
      scoreCompany(signals, {
        ...prefs,
        watchlistTier: c.watchlistTier,
        companyCategory: c.category,
        companyName: c.name,
        roleFamily: identity.roleFamily,
        geographyHints: identity.geographyHints,
      }),
    );
  }

  const openRoles = await repo.listOpenRoles();
  const openRoleInputs = [];
  for (const role of openRoles) {
    if (role.status !== "open" && role.status !== "rumored") continue;
    const co = await repo.getCompanyById(role.companyId);
    openRoleInputs.push({
      companyId: role.companyId,
      companyName: co?.name ?? role.companyId,
      title: role.title,
      location: role.location,
      sourceUrl: role.sourceUrl,
      status: role.status,
    });
  }

  const recs = buildRoleRecommendations({
    profileMarkdown,
    companies,
    signalsByCompany,
    scoresByCompany,
    openRoles: openRoleInputs,
    identityOverride: identity,
  });

  const targets = await repo.listOutreachTargets();
  const targetInputs: OutreachTargetInput[] = [];
  for (const t of targets) {
    const co = await repo.getCompanyById(t.companyId);
    targetInputs.push({
      companyId: t.companyId,
      companyName: co?.name ?? t.companyId,
      name: t.name,
      title: t.title,
      kind: t.kind,
      linkedInUrl: t.linkedInUrl,
      whyReachOut: t.whyReachOut,
      relatedRoleTitle: t.relatedRoleTitle,
    });
  }

  const matches: OnboardingMatch[] = recs.recommendations
    .slice(0, 5)
    .map((rec) => {
      const outreach = pickOutreachForRecommendation({
        recommendation: rec,
        targets: targetInputs,
      }).map((t) => ({
        name: t.name,
        title: t.title,
        kind: t.kind,
        linkedInUrl: t.linkedInUrl,
        angle: suggestOutreachAngles(identity, rec, t),
      }));
      return { ...rec, outreach };
    });

  const interestPhrase = input.interests?.length
    ? ` Interests: ${input.interests.join(", ")}.`
    : "";

  const deepLink = telegramDeepLink();
  const telegramBits = [
    input.consentUpdates
      ? "I consented to Telegram updates."
      : "I have not linked Telegram yet.",
    input.telegramUsername
      ? `My Telegram username is @${input.telegramUsername.replace(/^@/, "")}.`
      : null,
    deepLink
      ? `If chatId is not saved yet, remind me to open ${deepLink} and tap Start, then call save_messaging_destination when linked.`
      : "Telegram bot is not configured in env yet — skip messaging link for now.",
  ]
    .filter(Boolean)
    .join(" ");

  const kickoffMessage = [
    `I just finished setup.`,
    `I'm a ${identity.currentTitle} at ${identity.currentCompany} in ${identity.location}.${interestPhrase}`,
    telegramBits,
    `Load skill onboarding if messaging is not linked yet.`,
    `First call ingest_linkedin_profile with name=${JSON.stringify(identity.name ?? "")}, currentTitle=${JSON.stringify(identity.currentTitle)}, currentCompany=${JSON.stringify(identity.currentCompany)}, location=${JSON.stringify(identity.location)}, headline=${JSON.stringify(identity.headline)}, summary=${JSON.stringify(identity.summary ?? "")}.`,
    `Then call recommend_roles, walk me through the best gravy-train seats and who to reach out to, briefly explain how to use Gravy Scout (chat, preferences, nightly digests), ask 1–2 questions about what I want next, and keep updating my profile as we explore.`,
    `When Telegram is linked, call save_messaging_destination with onboardingComplete=true.`,
  ].join(" ");

  return { identity, matches, kickoffMessage, profilePersisted };
}
