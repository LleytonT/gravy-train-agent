"use client";

import type { OnboardingMatch } from "@/agent/lib/onboarding-types";

type MatchesCardProps = {
  matches: OnboardingMatch[];
  onExplore: (prompt: string) => void;
  disabled?: boolean;
};

export function MatchesCard({ matches, onExplore, disabled }: MatchesCardProps) {
  if (matches.length === 0) return null;

  return (
    <div
      className="animate-rise rounded-2xl border border-line bg-surface/90 p-4 shadow-[0_1px_0_rgba(14,24,20,0.04)] md:p-5"
      style={{ animationDelay: "40ms" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
          Roles that fit you
        </h2>
        <p className="font-mono text-[10px] tracking-[0.16em] text-ink-muted uppercase">
          Top {matches.length}
        </p>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Gravy-train seats matched to your title and location — tap one to go deeper.
      </p>

      <ul className="mt-4 space-y-3">
        {matches.map((match) => {
          const hm = match.outreach.find((o) => o.kind === "hiring_manager");
          const peer = match.outreach.find((o) => o.kind === "peer_in_seat");
          const contact = hm ?? peer ?? match.outreach[0];
          return (
            <li key={match.companyId}>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onExplore(
                    `Tell me more about ${match.recommendedTitles[0] ?? "roles"} at ${match.companyName} and who I should reach out to.`,
                  )
                }
                className="group w-full rounded-xl border border-line bg-paper/60 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-signal hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink group-hover:text-signal-deep">
                      {match.companyName}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {match.recommendedTitles.slice(0, 3).join(" · ")}
                    </p>
                    {contact ? (
                      <p className="mt-1.5 text-xs text-ink-muted">
                        Reach out: {contact.name} ({contact.title})
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-signal-deep">
                    {match.gravyScore.toFixed(1)}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
