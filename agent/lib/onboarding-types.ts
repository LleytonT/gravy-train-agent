/** Shared onboarding types — safe for client and server (no Node imports). */

export type OnboardingInput = {
  name?: string;
  currentTitle: string;
  currentCompany: string;
  location: string;
  interests?: string[];
  seniority?: string;
};

export type OnboardingOutreach = {
  name: string;
  title: string;
  kind: string;
  angle: string;
  linkedInUrl?: string | null;
};

export type OnboardingMatch = {
  companyId: string;
  companyName: string;
  companyTier: string;
  companyCategory: string | null;
  recommendedTitles: string[];
  roleFit: number;
  gravyScore: number;
  pingTier: "immediate" | "digest" | "none";
  why: string[];
  geographyFit: boolean;
  matchedSignals: string[];
  outreach: OnboardingOutreach[];
};

export type OnboardingIdentitySnapshot = {
  name?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  roleFamily?: string;
};
