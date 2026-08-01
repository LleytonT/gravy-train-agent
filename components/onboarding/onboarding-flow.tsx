"use client";

import { useEffect, useState } from "react";

import type { OnboardingMatch } from "@/agent/lib/onboarding-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { INTEREST_OPTIONS } from "./onboarding-storage";

type OnboardingFlowProps = {
  onComplete: (result: {
    identity: {
      name?: string;
      currentTitle?: string;
      currentCompany?: string;
      location?: string;
      roleFamily: string;
    };
    matches: OnboardingMatch[];
    kickoffMessage: string;
  }) => void;
};

type Step = "welcome" | "setup" | "messaging";

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [location, setLocation] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [telegramUsername, setTelegramUsername] = useState("");
  const [consentUpdates, setConsentUpdates] = useState(true);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/messaging-config")
      .then((res) => res.json())
      .then((data: { deepLink?: string | null; botUsername?: string | null }) => {
        setDeepLink(data.deepLink ?? null);
        setBotUsername(data.botUsername ?? null);
      })
      .catch(() => {
        /* optional — bot may not be configured locally yet */
      });
  }, []);

  function toggleInterest(interest: string) {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : prev.length >= 5
          ? prev
          : [...prev, interest],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          currentTitle: currentTitle.trim(),
          currentCompany: currentCompany.trim(),
          location: location.trim(),
          interests,
          telegramUsername: telegramUsername.trim() || undefined,
          consentUpdates,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        detail?: string;
        identity?: {
          name?: string;
          currentTitle?: string;
          currentCompany?: string;
          location?: string;
          roleFamily: string;
        };
        matches?: OnboardingMatch[];
        kickoffMessage?: string;
      };

      if (!res.ok || !data.identity || !data.matches || !data.kickoffMessage) {
        throw new Error(
          typeof data.error === "string"
            ? data.detail
              ? `${data.error}: ${data.detail}`
              : data.error
            : "Setup failed",
        );
      }

      onComplete({
        identity: data.identity,
        matches: data.matches,
        kickoffMessage: data.kickoffMessage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
      setBusy(false);
    }
  }

  if (step === "welcome") {
    return (
      <div className="flex min-h-dvh flex-col overflow-hidden">
        <div className="relative flex flex-1 flex-col justify-center px-6 py-16 md:px-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(900px 520px at 12% 10%, #c5e0d0 0%, transparent 55%), radial-gradient(700px 420px at 90% 20%, #d2e6db 0%, transparent 50%)",
            }}
          />
          <div className="relative mx-auto w-full max-w-xl animate-rise">
            <Badge variant="secondary" className="font-mono text-[11px] uppercase tracking-[0.16em]">
              60-second setup
            </Badge>
            <h1 className="mt-4 font-display text-5xl leading-[0.95] font-semibold tracking-tight md:text-6xl">
              Gravy Scout
            </h1>
            <p className="mt-5 max-w-md text-lg leading-8 text-muted-foreground text-balance">
              Tell us who you are, link Telegram for nightly updates, then chat
              as your career advisor while we watch the gravy train.
            </p>
            <ul className="mt-8 space-y-3 text-sm leading-6">
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Role-fit matches at companies expanding into your territory
              </li>
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Who to reach out to — hiring manager, peer in seat, adjacent
              </li>
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Telegram digests when a real opportunity appears
              </li>
            </ul>
            <Button size="lg" className="mt-10" onClick={() => setStep("setup")}>
              Get started
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "setup") {
    return (
      <div className="flex min-h-dvh flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-12 md:px-8">
          <div className="animate-rise">
            <Badge variant="secondary" className="font-mono text-[11px] uppercase tracking-[0.16em]">
              Step 1 of 2
            </Badge>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">
              Your role today
            </h1>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Title, company, and location personalize the gravy train. Interests
              help us rank seats — refine anytime in chat.
            </p>
          </div>

          <Card className="animate-rise mt-8 border-border shadow-sm" style={{ animationDelay: "80ms" }}>
            <CardContent className="pt-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    !currentTitle.trim() ||
                    !currentCompany.trim() ||
                    !location.trim()
                  ) {
                    return;
                  }
                  setStep("messaging");
                }}
                className="space-y-5"
              >
                <Field
                  label="Name"
                  optional
                  value={name}
                  onChange={setName}
                  placeholder="Alex"
                  autoComplete="name"
                />
                <Field
                  label="Current title"
                  value={currentTitle}
                  onChange={setCurrentTitle}
                  placeholder="Sales Engineer"
                  required
                  autoComplete="organization-title"
                />
                <Field
                  label="Company"
                  value={currentCompany}
                  onChange={setCurrentCompany}
                  placeholder="Vercel"
                  required
                  autoComplete="organization"
                />
                <Field
                  label="Location"
                  value={location}
                  onChange={setLocation}
                  placeholder="Sydney, Australia"
                  required
                  autoComplete="address-level2"
                />

                <fieldset>
                  <legend className="text-sm font-medium">
                    Interests{" "}
                    <span className="font-normal text-muted-foreground">
                      (pick up to 5)
                    </span>
                  </legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {INTEREST_OPTIONS.map((interest) => {
                      const selected = interests.includes(interest);
                      return (
                        <Button
                          key={interest}
                          type="button"
                          size="sm"
                          variant={selected ? "default" : "outline"}
                          onClick={() => toggleInterest(interest)}
                        >
                          {interest}
                        </Button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("welcome")}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={
                      !currentTitle.trim() ||
                      !currentCompany.trim() ||
                      !location.trim()
                    }
                  >
                    Continue
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-12 md:px-8">
        <div className="animate-rise">
          <Badge variant="secondary" className="font-mono text-[11px] uppercase tracking-[0.16em]">
            Step 2 of 2
          </Badge>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">
            Get updates on Telegram
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            We&apos;ll text you when a real gravy-train opportunity shows up.
            You can chat back anytime — same agent as this web app.
          </p>
        </div>

        <Card className="animate-rise mt-8 border-border shadow-sm" style={{ animationDelay: "80ms" }}>
          <CardHeader>
            <CardTitle className="text-base">Messaging</CardTitle>
            <CardDescription>
              Optional now — you can finish setup and link later in chat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="space-y-5"
            >
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
                <Checkbox
                  checked={consentUpdates}
                  onCheckedChange={(checked) =>
                    setConsentUpdates(checked === true)
                  }
                  className="mt-0.5"
                />
                <span className="text-sm leading-6">
                  Use my Telegram to send nightly opportunity updates. I can reply
                  to chat or ask you to stop anytime.
                </span>
              </label>

              <Field
                label="Telegram username"
                optional
                value={telegramUsername}
                onChange={setTelegramUsername}
                placeholder="your_handle"
                autoComplete="username"
              />

              {deepLink ? (
                <Button asChild variant="secondary" className="w-full" size="lg">
                  <a href={deepLink} target="_blank" rel="noreferrer">
                    Open @{botUsername ?? "GravyScout"} and tap Start
                  </a>
                </Button>
              ) : (
                <Alert>
                  <AlertDescription>
                    Telegram bot isn&apos;t configured on this deploy yet. You can
                    finish setup now and link later in chat.
                  </AlertDescription>
                </Alert>
              )}

              <p className="text-xs leading-5 text-muted-foreground">
                After you tap Start, we save your chat ID automatically. Digests
                only go out when you&apos;ve consented.
              </p>

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("setup")}
                  disabled={busy}
                >
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={busy}>
                  {busy ? "Finding matches…" : "See my matches"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  autoComplete?: string;
}) {
  const id = props.label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={cn("text-sm font-medium")}>
        {props.label}
        {props.optional ? (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        ) : null}
      </Label>
      <Input
        id={id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        autoComplete={props.autoComplete}
      />
    </div>
  );
}
