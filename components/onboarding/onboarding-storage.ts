import type {
  OnboardingIdentitySnapshot,
  OnboardingMatch,
} from "@/agent/lib/onboarding-types";

const STORAGE_KEY = "gravy-scout.onboarding.v1";

export type OnboardingState = {
  completed: boolean;
  completedAt?: number;
  identity?: OnboardingIdentitySnapshot;
  matches?: OnboardingMatch[];
  kickoffMessage?: string;
  kickoffSent?: boolean;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadOnboardingState(): OnboardingState {
  if (!canUseStorage()) return { completed: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completed: false };
    const parsed = JSON.parse(raw) as OnboardingState;
    return parsed?.completed ? parsed : { completed: false };
  } catch {
    return { completed: false };
  }
}

export function saveOnboardingState(state: OnboardingState) {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearOnboardingState() {
  if (!canUseStorage()) return;
  localStorage.removeItem(STORAGE_KEY);
}

export const INTEREST_OPTIONS = [
  "AI infra / GPU",
  "Developer tools",
  "AI agents / CX",
  "Enterprise SaaS",
  "Data / analytics",
  "Security",
  "Hyperscaler-adjacent",
  "Seed / early-stage",
] as const;
