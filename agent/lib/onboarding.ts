/**
 * First-run onboarding: persist Career Identity + return personalized matches.
 * Used by POST /api/onboarding (no LLM required).
 *
 * Structured career profile (Postgres) is authoritative.
 */

import {
  applyExplicitProfileChanges,
  getMemberContextSnapshot,
  scoringPrefsFromSnapshot,
} from "./career-profile.js";
import { ensureSchema } from "./db/client.js";
import { repo } from "./db/repo.js";
import type { OnboardingInput, OnboardingMatch } from "./onboarding-types.js";
import {
  buildRoleRecommendations,
  pickOutreachForRecommendation,
  suggestOutreachAngles,
  type OutreachTargetInput,
} from "./personalize.js";
import { isTelegramConfigured, telegramBotInfoLink } from "./messaging.js";
import type { CareerIdentity } from "./role-affinity.js";
import {
  detectRoleFamily,
  extractGeographyHints,
} from "./role-affinity.js";
import { scoreCompany } from "./scoring.js";

export type { OnboardingInput, OnboardingMatch } from "./onboarding-types.js";

export type OnboardingResult = {
  identity: CareerIdentity;
  matches: OnboardingMatch[];
  kickoffMessage: string;
  profilePersisted: boolean;
};

export type OnboardingPreviewInput = Omit<OnboardingInput, "memberId">;

function buildIdentity(input: OnboardingPreviewInput): CareerIdentity {
  const roleFamily = detectRoleFamily(input.currentTitle);
  const geographyHints = extractGeographyHints(
    input.location,
    input.currentTitle,
    input.currentCompany,
  );
  const headline = `${input.currentTitle} at ${input.currentCompany}`;
  return {
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
}

/**
 * Public preview: career snapshot → first recommendations without auth.
 * Does not persist profile state.
 */
export async function previewOnboarding(
  input: OnboardingPreviewInput,
): Promise<{ identity: CareerIdentity; matches: OnboardingMatch[] }> {
  await ensureSchema();
  const identity = buildIdentity(input);
  const matches = await matchRolesForIdentity(identity, null);
  return { identity, matches };
}

async function matchRolesForIdentity(
  identity: CareerIdentity,
  profileMarkdown: string | null,
): Promise<OnboardingMatch[]> {
  const prefs = {
    preferHyperscalers: false,
    avoidSeedStage: false,
    ignoreCategories: [] as string[],
    roleFamily: identity.roleFamily,
    geographyHints: identity.geographyHints,
  };

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
    profileMarkdown: profileMarkdown ?? "",
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

  return recs.recommendations.slice(0, 5).map((rec) => {
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
}

export async function completeOnboarding(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  await ensureSchema();

  if (!input.memberId?.trim()) {
    throw new Error("Authenticated memberId is required for onboarding");
  }

  const identity = buildIdentity(input);

  let profilePersisted = false;
  try {
    await applyExplicitProfileChanges(input.memberId, {
      name: identity.name,
      headline: identity.headline,
      currentTitle: identity.currentTitle,
      currentCompany: identity.currentCompany,
      location: identity.location,
      seniority: identity.seniority,
      summary: identity.summary,
      interests: input.interests,
      messaging: {
        telegramUsername: input.telegramUsername?.replace(/^@/, "") ?? null,
        consentUpdates: input.consentUpdates ?? false,
        onboardingComplete: false,
      },
    });
    profilePersisted = true;
  } catch (err) {
    console.warn(
      "[onboarding] structured profile persist failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const snapshot = profilePersisted
    ? await getMemberContextSnapshot(input.memberId)
    : null;
  const matches = await matchRolesForIdentity(
    identity,
    snapshot?.modelContextMarkdown ?? null,
  );

  const interestPhrase = input.interests?.length
    ? ` Interests: ${input.interests.join(", ")}.`
    : "";

  const botLink = telegramBotInfoLink();
  const telegramBits = [
    input.consentUpdates
      ? "I consented to Telegram updates."
      : "I have not consented to Telegram updates yet.",
    input.telegramUsername
      ? `My Telegram username is @${input.telegramUsername.replace(/^@/, "")} (display only — not identity).`
      : null,
    isTelegramConfigured() && botLink
      ? `Telegram is already verified for this member when signed in via Telegram Login. Deep-link minting remains available for channel reconnect.`
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
