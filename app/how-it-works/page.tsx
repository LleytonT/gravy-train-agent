import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { WorkflowDiagram } from "@/components/workflow/workflow-diagram";

export const metadata = {
  title: "How it works · Gravy Scout",
  description:
    "See how Gravy Scout reads LinkedIn and X, scores companies, and pings only when a real APAC GTM opportunity appears.",
};

const outcomes = [
  {
    title: "Catch APAC GTM moves early",
    body: "Spot expansion signals before AE roles hit the public boards.",
  },
  {
    title: "Keep dossiers current",
    body: "Company files stay updated with funding, hires, and presence notes.",
  },
  {
    title: "Ping only when it matters",
    body: "WhatsApp digests fire on real thresholds, not every weak signal.",
  },
];

const thinking = [
  {
    label: "Classify cheap",
    body: "Haiku batches raw feed items so the strong model never burns tokens on triage.",
  },
  {
    label: "Score with rules",
    body: "score_company runs deterministic math. The agent explains the score. It does not invent one.",
  },
  {
    label: "Remember corrections",
    body: "When you say ignore agencies or add Sierra, tools write profile and watchlist memory in that turn.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader active="workflow" />

      <main>
        <section className="relative overflow-hidden border-b border-line">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_70%_0%,#c7e2d2_0%,transparent_60%)]" />
          <div className="relative mx-auto flex min-h-[72vh] max-w-6xl flex-col justify-center px-4 py-16 md:px-6 md:py-24">
            <p className="animate-rise font-mono text-[11px] tracking-[0.2em] text-signal-deep uppercase">
              Gravy Scout
            </p>
            <h1 className="animate-rise mt-4 max-w-3xl font-display text-5xl leading-[0.95] font-semibold tracking-tight text-ink md:text-7xl">
              Nightly scout for APAC GTM opportunities
            </h1>
            <p
              className="animate-rise mt-5 max-w-xl text-lg leading-8 text-ink-muted text-balance"
              style={{ animationDelay: "80ms" }}
            >
              Capture LinkedIn and X on your machine. The agent classifies,
              scores, and messages you only when the signal clears the bar.
            </p>
            <div
              className="animate-rise mt-8 flex flex-wrap gap-3"
              style={{ animationDelay: "140ms" }}
            >
              <Link
                href="/"
                className="rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-signal-deep"
              >
                Open chat
              </Link>
              <a
                href="#workflow"
                className="rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-signal"
              >
                See the workflow
              </a>
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-surface/70">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              What it does for you
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-ink-muted">
              Built for one APAC sales operator. Low noise. Persistent memory.
            </p>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {outcomes.map((item, index) => (
                <div
                  key={item.title}
                  className="animate-step-in"
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <p className="font-mono text-[11px] tracking-[0.16em] text-signal-deep uppercase">
                    0{index + 1}
                  </p>
                  <h3 className="mt-3 font-display text-xl font-semibold text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-7 text-ink-muted">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              The nightly workflow
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-ink-muted">
              Capture runs on your Mac. The agent consumes DB rows, never posts
              or likes. The run below replays like a task progress flow: bar
              fills, steps flip queued to running to done, then a score gate
              splits ping vs quiet.
            </p>
            <div className="mt-10">
              <WorkflowDiagram />
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-mist/60">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              How it thinks
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-ink-muted">
              Sharp and cheap where it can be. Strong model only for synthesis
              and chat.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {thinking.map((item, index) => (
                <div
                  key={item.label}
                  className="animate-step-in border-t border-line-strong pt-5"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <h3 className="font-display text-lg font-semibold text-ink">
                    {item.label}
                  </h3>
                  <p className="mt-2 text-[15px] leading-7 text-ink-muted">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-16 md:flex-row md:items-end md:justify-between md:px-6 md:py-20">
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
                Talk to the scout
              </h2>
              <p className="mt-3 max-w-xl text-base leading-7 text-ink-muted">
                Score Modal. Ask why Fireworks matters. Correct the watchlist.
                Memory updates stick.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-ink-muted"
            >
              Start chatting
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
