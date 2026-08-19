"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { OnboardingMatch } from "@/agent/lib/onboarding-types";
import { TelegramLoginButton } from "@/components/auth/telegram-login-button";
import {
  INTEREST_OPTIONS,
  loadOnboardingState,
  saveOnboardingState,
} from "@/components/onboarding/onboarding-storage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Step = "snapshot" | "goals" | "matches" | "verify";

const steps: Step[] = ["snapshot", "goals", "matches", "verify"];

export function ProgressiveOnboarding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceVerify = searchParams.get("verify") === "1";
  const nextPath = searchParams.get("next") || "/app";

  const [step, setStep] = useState<Step>(forceVerify ? "verify" : "snapshot");
  const [name, setName] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [location, setLocation] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [constraints, setConstraints] = useState("");
  const [goals, setGoals] = useState("");
  const [matches, setMatches] = useState<OnboardingMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const existing = loadOnboardingState();
    if (existing.identity) {
      setName(existing.identity.name ?? "");
      setCurrentTitle(existing.identity.currentTitle ?? "");
      setCurrentCompany(existing.identity.currentCompany ?? "");
      setLocation(existing.identity.location ?? "");
    }
    if (existing.matches?.length) setMatches(existing.matches);
    if (forceVerify) setStep("verify");
    void fetch("/api/auth/session", { credentials: "include" })
      .then((res) => res.json())
      .then((data: { authenticated?: boolean }) => {
        if (data.authenticated && forceVerify) {
          router.replace(nextPath);
        }
      })
      .catch(() => undefined);
  }, [forceVerify, nextPath, router]);

  const progress = useMemo(() => {
    const index = steps.indexOf(step);
    return ((index + 1) / steps.length) * 100;
  }, [step]);

  function toggleInterest(interest: string) {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((item) => item !== interest)
        : [...prev, interest],
    );
  }

  async function previewMatches() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          currentTitle,
          currentCompany,
          location,
          interests,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        matches?: OnboardingMatch[];
        identity?: {
          name?: string;
          currentTitle?: string;
          currentCompany?: string;
          location?: string;
          roleFamily: string;
        };
      };
      if (!res.ok) throw new Error(data.error ?? "Could not preview matches");
      setMatches(data.matches ?? []);
      saveOnboardingState({
        completed: false,
        identity: data.identity
          ? {
              name: data.identity.name,
              currentTitle: data.identity.currentTitle,
              currentCompany: data.identity.currentCompany,
              location: data.identity.location,
              roleFamily: data.identity.roleFamily,
            }
          : undefined,
        matches: data.matches,
      });
      setStep("matches");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function persistAfterAuth() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name || undefined,
          currentTitle,
          currentCompany,
          location,
          interests: [
            ...interests,
            ...(goals ? [`Goals: ${goals}`] : []),
            ...(constraints ? [`Constraints: ${constraints}`] : []),
          ],
          consentUpdates: true,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        matches?: OnboardingMatch[];
        kickoffMessage?: string;
        identity?: {
          name?: string;
          currentTitle?: string;
          currentCompany?: string;
          location?: string;
          roleFamily: string;
        };
      };
      if (!res.ok) throw new Error(data.error ?? "Could not save onboarding");
      saveOnboardingState({
        completed: true,
        completedAt: Date.now(),
        identity: data.identity
          ? {
              name: data.identity.name,
              currentTitle: data.identity.currentTitle,
              currentCompany: data.identity.currentCompany,
              location: data.identity.location,
              roleFamily: data.identity.roleFamily,
            }
          : undefined,
        matches: data.matches ?? matches,
        kickoffMessage: data.kickoffMessage,
      });
      router.push(nextPath.startsWith("/app") ? nextPath : "/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <div className="space-y-3">
        <Badge variant="secondary" className="font-mono text-[11px] uppercase tracking-[0.16em]">
          Get started
        </Badge>
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
          {step === "verify"
            ? "Verify to keep your scout"
            : "Tell Gravy Scout who you are"}
        </h1>
        <p className="text-muted-foreground">
          {step === "verify"
            ? "Verification happens only when you are ready to use the product. Telegram is the default — no account form before that."
            : "No login yet. Sketch your career snapshot, see first matches, then verify with Telegram when you want them saved."}
        </p>
        <Progress value={progress} className="h-1.5" aria-label="Onboarding progress" />
      </div>

      {step === "snapshot" ? (
        <section className="animate-rise space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Current title</Label>
              <Input
                id="title"
                value={currentTitle}
                onChange={(event) => setCurrentTitle(event.target.value)}
                placeholder="Sales Engineer"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={currentCompany}
                onChange={(event) => setCurrentCompany(event.target.value)}
                placeholder="Vercel"
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Sydney, Australia"
                required
              />
            </div>
          </div>
          <Button
            size="lg"
            disabled={!currentTitle || !currentCompany || !location}
            onClick={() => setStep("goals")}
          >
            Continue
          </Button>
        </section>
      ) : null}

      {step === "goals" ? (
        <section className="animate-rise space-y-5">
          <div className="space-y-2">
            <Label htmlFor="goals">Goals</Label>
            <Input
              id="goals"
              value={goals}
              onChange={(event) => setGoals(event.target.value)}
              placeholder="APAC field / deployment seats at AI infra"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="constraints">Hard constraints</Label>
            <Input
              id="constraints"
              value={constraints}
              onChange={(event) => setConstraints(event.target.value)}
              placeholder="No seed-stage, AU/NZ remote preferred"
            />
          </div>
          <div className="space-y-3">
            <Label>Interests</Label>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((interest) => {
                const selected = interests.includes(interest);
                return (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm transition-colors",
                      selected
                        ? "border-signal bg-signal/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-signal/40",
                    )}
                    aria-pressed={selected}
                  >
                    {interest}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setStep("snapshot")}>
              Back
            </Button>
            <Button
              size="lg"
              disabled={busy}
              onClick={() => void previewMatches()}
            >
              {busy ? <Spinner className="size-4" /> : null}
              See first matches
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setMatches([]);
                setStep("matches");
              }}
            >
              Skip preview
            </Button>
          </div>
        </section>
      ) : null}

      {step === "matches" ? (
        <section className="animate-rise space-y-5">
          {matches.length === 0 ? (
            <Alert>
              <AlertDescription>
                No seeded roles matched yet. You can still verify and open the
                workspace — discovery will fill Today as signals arrive.
              </AlertDescription>
            </Alert>
          ) : (
            <ul className="space-y-4">
              {matches.map((match) => (
                <li
                  key={`${match.companyId}-${match.recommendedTitles[0] ?? "role"}`}
                  className="border-t border-border pt-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{match.companyName}</Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      score {match.gravyScore.toFixed(1)}
                    </span>
                  </div>
                  <h2 className="mt-2 font-display text-xl font-semibold">
                    {match.recommendedTitles[0] ?? "Role match"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {match.why[0] ?? "Strong fit based on your career snapshot."}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setStep("goals")}>
              Back
            </Button>
            <Button size="lg" onClick={() => setStep("verify")}>
              Save &amp; enter workspace
            </Button>
          </div>
        </section>
      ) : null}

      {step === "verify" ? (
        <section className="animate-rise space-y-5">
          <div className="space-y-2 rounded-xl border border-border/80 bg-card/70 p-5">
            <h2 className="font-display text-xl font-semibold">
              Verify with Telegram
            </h2>
            <p className="text-sm text-muted-foreground">
              Telegram proves you are a real person and is how Gravy Scout
              texts you. The same Telegram user ID is your member identity —
              you can also just message the bot to start.
            </p>
            <TelegramLoginButton
              onAuthenticated={() => {
                void persistAfterAuth();
              }}
            />
          </div>

          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Checkbox id="alerts" defaultChecked disabled />
            <Label htmlFor="alerts" className="font-normal leading-5">
              After verify, configure alert email and Telegram digests independently
              in Profile.
            </Label>
          </div>

          <Button variant="outline" asChild>
            <Link href="/">Back to product overview</Link>
          </Button>
        </section>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
