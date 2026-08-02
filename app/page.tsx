import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader active="home" />
      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_560px_at_85%_-10%,#9fd4b8_0%,transparent_55%),linear-gradient(120deg,rgba(14,24,20,0.04),transparent_40%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22 viewBox=%220 0 160 160%22%3E%3Cpath fill=%22%230c7a52%22 fill-opacity=%220.05%22 d=%22M0 160L160 0H80L0 80zm160 0V80L80 160z%22/%3E%3C/svg%3E')] opacity-80"
          />
          <div className="relative mx-auto flex min-h-[88dvh] max-w-6xl flex-col justify-end px-4 pb-16 pt-24 md:justify-center md:px-6 md:pb-24 md:pt-20">
            <p className="animate-rise font-display text-5xl font-semibold tracking-tight text-ink md:text-7xl lg:text-8xl">
              Gravy Scout
            </p>
            <h1 className="animate-rise mt-5 max-w-2xl font-display text-2xl leading-tight font-medium tracking-tight text-ink md:text-4xl">
              Opportunity intelligence before the role hits the board.
            </h1>
            <p
              className="animate-rise mt-4 max-w-xl text-base leading-7 text-ink-muted md:text-lg"
              style={{ animationDelay: "80ms" }}
            >
              Evidence-backed seats for APAC GTM operators — scored nightly,
              explained clearly, delivered when the signal clears the bar.
            </p>
            <div
              className="animate-rise mt-8 flex flex-wrap gap-3"
              style={{ animationDelay: "140ms" }}
            >
              <Button asChild size="lg">
                <Link href="/get-started">See your first matches</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>
            <p
              className="animate-fade-in mt-6 max-w-md text-sm text-muted-foreground"
              style={{ animationDelay: "220ms" }}
            >
              No login to explore. Verify with Telegram only when you are ready
              to keep a scout running.
            </p>
          </div>
        </section>

        <section className="border-t border-border bg-card/50">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-3 md:px-6">
            {[
              {
                title: "Career snapshot, not a scrape",
                body: "Title, company, location, goals, and constraints are enough for first recommendations.",
              },
              {
                title: "Today is a short list",
                body: "Each opportunity shows fit, risk, freshness, confidence, evidence, and a next action.",
              },
              {
                title: "Telegram when you are ready",
                body: "Alerts and chat sync after you verify — configure digests and inbound email independently.",
              },
            ].map((item, index) => (
              <div
                key={item.title}
                className="animate-step-in space-y-3"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  0{index + 1}
                </Badge>
                <h2 className="font-display text-2xl font-semibold tracking-tight">
                  {item.title}
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
