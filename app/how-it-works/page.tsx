import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    body: "Telegram digests fire on real thresholds, not every weak signal.",
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
        <section className="relative overflow-hidden border-b border-border">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_70%_0%,#c7e2d2_0%,transparent_60%)]" />
          <div className="relative mx-auto flex min-h-[72vh] max-w-6xl flex-col justify-center px-4 py-16 md:px-6 md:py-24">
            <Badge
              variant="secondary"
              className="animate-rise w-fit font-mono text-[11px] uppercase tracking-[0.16em]"
            >
              Gravy Scout
            </Badge>
            <h1 className="animate-rise mt-4 max-w-3xl font-display text-5xl leading-[0.95] font-semibold tracking-tight md:text-7xl">
              Nightly scout for APAC GTM opportunities
            </h1>
            <p
              className="animate-rise mt-5 max-w-xl text-lg leading-8 text-muted-foreground text-balance"
              style={{ animationDelay: "80ms" }}
            >
              Capture LinkedIn and X on your machine. The agent classifies,
              scores, and messages you only when the signal clears the bar.
            </p>
            <div
              className="animate-rise mt-8 flex flex-wrap gap-3"
              style={{ animationDelay: "140ms" }}
            >
              <Button asChild size="lg">
                <Link href="/get-started">Get started</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#workflow">See the workflow</a>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card/70">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
              What it does for you
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Built for one APAC sales operator. Low noise. Persistent memory.
            </p>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {outcomes.map((item, index) => (
                <div
                  key={item.title}
                  className="animate-step-in"
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">
                    0{index + 1}
                  </p>
                  <h3 className="mt-3 font-display text-xl font-semibold">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-7 text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
              The nightly workflow
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
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

        <section className="border-b border-border bg-muted/60">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
              How it thinks
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Sharp and cheap where it can be. Strong model only for synthesis
              and chat.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {thinking.map((item, index) => (
                <div
                  key={item.label}
                  className="animate-step-in border-t border-border pt-5"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <h3 className="font-display text-lg font-semibold">
                    {item.label}
                  </h3>
                  <p className="mt-2 text-[15px] leading-7 text-muted-foreground">
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
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Talk to the scout
              </h2>
              <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
                Score Modal. Ask why Fireworks matters. Correct the watchlist.
                Memory updates stick.
              </p>
            </div>
            <Button asChild size="lg" variant="secondary">
              <Link href="/">Start chatting</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
