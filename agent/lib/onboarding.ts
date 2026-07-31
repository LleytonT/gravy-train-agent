/**
 * First-run onboarding: persist Career Identity + return personalized matches.
 * Used by POST /api/onboarding (no LLM required).
 */

import { ensureSchema } from "./db/client.js";
import { repo } from "./db/repo.js";
import type { OnboardingInput, OnboardingMatch } from "./onboarding-types.js";
import {
  buildRoleRecommendations,
  pickOutreachForRecommendation,
  suggestOutreachAngles,
  type OutreachTargetInput,
} from "./personalize.js";
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
};

export async function completeOnboarding(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  await ensureSchema();

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
        `- Role family: ${roleFamily}`,
      ].join("\n"),
    },
  });

  if (input.interests?.length) {
    updateUserProfile({
      replaceSection: {
        heading: "Interests",
        content: [
          `- Strong: ${input.interests.join(", ")}`,
          `- Also open: _(tell me as we explore)_`,
          `- Seed watchlist companies: Modal, Fireworks AI, Cursor, ElevenLabs, Decagon, Sierra`,
          `- People-watchlist: _(add as we explore)_`,
        ].join("\n"),
      },
    });
  }

  const profile = readUserProfile();
  const prefs = parsePreferences(profile);
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
    profileMarkdown: profile,
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

  const kickoffMessage = [
    `I just finished setup.`,
    `I'm a ${identity.currentTitle} at ${identity.currentCompany} in ${identity.location}.${interestPhrase}`,
    `Walk me through the best gravy-train roles for me (use recommend_roles), highlight who to reach out to, ask 1–2 questions about what I want next, and keep updating my profile as we explore.`,
  ].join(" ");

  return { identity, matches, kickoffMessage };
}
