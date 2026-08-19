"use client";

import { useEffect, useState } from "react";

type StepStatus = "pending" | "active" | "done";

const steps = [
  {
    id: "capture",
    title: "Capture feeds",
    detail: "Playwright reads LinkedIn and X from your logged-in profile.",
  },
  {
    id: "classify",
    title: "Classify batch",
    detail: "Haiku labels items. Weak noise stays dossier-only.",
  },
  {
    id: "dossier",
    title: "Update dossiers",
    detail: "Signals save to company files with sources and excerpts.",
  },
  {
    id: "score",
    title: "Score companies",
    detail: "Deterministic score_company math sets urgency.",
  },
  {
    id: "decide",
    title: "Threshold check",
    detail: "Immediate, digest, or dossier-only. 48h cooldown per company.",
  },
  {
    id: "ping",
    title: "Ping or wait",
    detail: "Telegram digest only when thresholds clear. Else stay quiet.",
  },
] as const;

const STEP_MS = 1100;
const HOLD_MS = 1800;

function statusFor(index: number, activeIndex: number): StepStatus {
  if (activeIndex >= steps.length) return "done";
  if (index < activeIndex) return "done";
  if (index === activeIndex) return "active";
  return "pending";
}

export function WorkflowDiagram() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setActiveIndex(steps.length);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let index = 0;
    setActiveIndex(0);

    function advance() {
      if (cancelled) return;
      index += 1;
      if (index < steps.length) {
        setActiveIndex(index);
        timer = setTimeout(advance, STEP_MS);
        return;
      }
      setActiveIndex(steps.length);
      timer = setTimeout(() => {
        if (cancelled) return;
        index = 0;
        setActiveIndex(0);
        timer = setTimeout(advance, STEP_MS);
      }, HOLD_MS);
    }

    timer = setTimeout(advance, STEP_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const completed = Math.min(activeIndex, steps.length);
  const progress =
    activeIndex >= steps.length ? 1 : (completed + 0.45) / steps.length;
  const percent = Math.round(progress * 100);
  const currentLabel =
    activeIndex >= steps.length
      ? "Run complete"
      : steps[activeIndex]?.title ?? "Starting";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/10">
      <div className="border-b border-border px-4 py-4 md:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">
              Live run
            </p>
            <p className="mt-1 font-display text-lg font-semibold">
              {currentLabel}
            </p>
          </div>
          <p className="font-mono text-sm text-muted-foreground">{percent}%</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="hidden px-4 py-8 md:block md:px-6">
        <div className="mx-auto grid max-w-5xl grid-cols-6 gap-3">
          {steps.map((step, index) => {
            const status = statusFor(index, activeIndex);
            return (
              <div
                key={step.id}
                className={[
                  "relative flex min-h-[160px] flex-col rounded-xl border px-3 py-3 transition duration-500",
                  status === "active"
                    ? "border-primary bg-muted shadow-[0_14px_30px_-20px_rgba(12,122,82,0.55)]"
                    : status === "done"
                      ? "border-primary/50 bg-muted/80"
                      : "border-border bg-muted/40",
                ].join(" ")}
              >
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden
                    className={[
                      "pointer-events-none absolute top-8 -right-2 z-10 h-px w-3 transition",
                      status === "done" ? "bg-primary" : "bg-border",
                    ].join(" ")}
                  />
                ) : null}
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      "grid h-6 w-6 place-items-center rounded-md font-mono text-[11px] font-medium transition",
                      status === "active"
                        ? "animate-pulse-dot bg-primary text-white"
                        : status === "done"
                          ? "bg-primary text-white"
                          : "bg-secondary text-muted-foreground",
                    ].join(" ")}
                  >
                    {status === "done" ? "✓" : index + 1}
                  </span>
                  <p className="font-display text-sm leading-5 font-semibold text-foreground">
                    {step.title}
                  </p>
                </div>
                <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
                  {step.detail}
                </p>
                <p
                  className={[
                    "mt-auto pt-3 font-mono text-[10px] tracking-[0.14em] uppercase",
                    status === "pending" ? "text-muted-foreground" : "text-primary",
                  ].join(" ")}
                >
                  {status === "active"
                    ? "Running"
                    : status === "done"
                      ? "Done"
                      : "Queued"}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div
            className={[
              "rounded-xl border px-4 py-3 transition duration-500",
              activeIndex >= 5
                ? "border-primary bg-muted"
                : "border-border bg-muted/40",
            ].join(" ")}
          >
            <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              Branch A
            </p>
            <p className="mt-1 font-display text-sm font-semibold text-foreground">
              Clear threshold
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Create opportunity and send Telegram digest.
            </p>
          </div>
          <div className="px-2 text-center">
            <p className="font-mono text-[10px] tracking-[0.14em] text-primary uppercase">
              Split
            </p>
            <p className="mt-1 font-display text-sm font-semibold text-foreground">
              Score gate
            </p>
          </div>
          <div
            className={[
              "rounded-xl border px-4 py-3 transition duration-500",
              activeIndex >= 5
                ? "border-border-strong bg-muted/40"
                : "border-border bg-muted/40",
            ].join(" ")}
          >
            <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              Branch B
            </p>
            <p className="mt-1 font-display text-sm font-semibold text-foreground">
              Stay quiet
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Keep dossier only. Roll weak signals into later digests.
            </p>
          </div>
        </div>
      </div>

      <ol className="flex flex-col gap-0 px-4 py-4 md:hidden">
        {steps.map((step, index) => {
          const status = statusFor(index, activeIndex);
          return (
            <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
              <div className="flex w-6 flex-col items-center">
                <span
                  className={[
                    "mt-0.5 grid h-6 w-6 place-items-center rounded-md font-mono text-[11px] transition",
                    status === "active"
                      ? "animate-pulse-dot bg-primary text-white"
                      : status === "done"
                        ? "bg-primary text-white"
                        : "bg-secondary text-muted-foreground",
                  ].join(" ")}
                >
                  {status === "done" ? "✓" : index + 1}
                </span>
                {index < steps.length - 1 ? (
                  <span
                    className={[
                      "mt-1 w-px flex-1 transition",
                      status === "done" ? "bg-primary" : "bg-border",
                    ].join(" ")}
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-semibold text-foreground">
                  {step.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {step.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
