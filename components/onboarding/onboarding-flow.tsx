"use client";

import { useState } from "react";

import type { OnboardingMatch } from "@/agent/lib/onboarding-types";
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

type Step = "welcome" | "setup";

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [location, setLocation] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            <p className="font-mono text-[11px] tracking-[0.2em] text-signal-deep uppercase">
              60-second setup
            </p>
            <h1 className="mt-4 font-display text-5xl leading-[0.95] font-semibold tracking-tight text-ink md:text-6xl">
              Gravy Scout
            </h1>
            <p className="mt-5 max-w-md text-lg leading-8 text-ink-muted text-balance">
              Tell us who you are once. We map gravy-train seats to your role,
              then act as your career advisor as you explore.
            </p>
            <ul className="mt-8 space-y-3 text-sm leading-6 text-ink">
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                Role-fit matches at companies expanding into your territory
              </li>
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                Who to reach out to — hiring manager, peer in seat, adjacent
              </li>
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                Memory that grows as you scout (no Playwright required)
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setStep("setup")}
              className="mt-10 inline-flex items-center justify-center rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-paper transition hover:bg-signal-deep"
            >
              Get started
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-12 md:px-8">
        <div className="animate-rise">
          <p className="font-mono text-[11px] tracking-[0.2em] text-signal-deep uppercase">
            Step 2 of 2
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">
            Your role today
          </h1>
          <p className="mt-3 text-base leading-7 text-ink-muted">
            Title, company, and location personalize the gravy train. Interests
            help us rank seats — refine anytime in chat.
          </p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="animate-rise mt-8 space-y-5"
          style={{ animationDelay: "80ms" }}
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
            <legend className="text-sm font-medium text-ink">
              Interests{" "}
              <span className="font-normal text-ink-muted">(pick up to 5)</span>
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((interest) => {
                const selected = interests.includes(interest);
                return (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-sm transition",
                      selected
                        ? "border-signal bg-mist text-signal-deep"
                        : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
                    ].join(" ")}
                  >
                    {interest}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error ? (
            <p className="rounded-xl border border-warn bg-warn-soft px-3 py-2 text-sm text-warn">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep("welcome")}
              disabled={busy}
              className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted transition hover:text-ink disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={
                busy ||
                !currentTitle.trim() ||
                !currentCompany.trim() ||
                !location.trim()
              }
              className="flex-1 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-paper transition hover:bg-signal-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Finding matches…" : "See my matches"}
            </button>
          </div>
        </form>
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
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">
        {props.label}
        {props.optional ? (
          <span className="font-normal text-ink-muted"> (optional)</span>
        ) : null}
      </span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        autoComplete={props.autoComplete}
        className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-signal"
      />
    </label>
  );
}
