"use client";

import type { OnboardingMatch } from "@/agent/lib/onboarding-types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MatchesCardProps = {
  matches: OnboardingMatch[];
  onExplore: (prompt: string) => void;
  disabled?: boolean;
};

export function MatchesCard({ matches, onExplore, disabled }: MatchesCardProps) {
  if (matches.length === 0) return null;

  return (
    <Card
      className="animate-rise border-border bg-card/90 shadow-sm"
      style={{ animationDelay: "40ms" }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle className="font-display text-lg tracking-tight">
            Roles that fit you
          </CardTitle>
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            Top {matches.length}
          </Badge>
        </div>
        <CardDescription>
          Gravy-train seats matched to your title and location — tap one to go deeper.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {matches.map((match) => {
          const hm = match.outreach.find((o) => o.kind === "hiring_manager");
          const peer = match.outreach.find((o) => o.kind === "peer_in_seat");
          const contact = hm ?? peer ?? match.outreach[0];
          return (
            <button
              key={match.companyId}
              type="button"
              disabled={disabled}
              onClick={() =>
                onExplore(
                  `Tell me more about ${match.recommendedTitles[0] ?? "roles"} at ${match.companyName} and who I should reach out to.`,
                )
              }
              className={cn(
                "group w-full rounded-lg border border-border bg-muted/40 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-primary hover:bg-card disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium group-hover:text-primary">
                    {match.companyName}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {match.recommendedTitles.slice(0, 3).join(" · ")}
                  </p>
                  {contact ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Reach out: {contact.name} ({contact.title})
                    </p>
                  ) : null}
                </div>
                <Badge variant="outline" className="shrink-0 font-mono text-[11px] text-primary">
                  {match.gravyScore.toFixed(1)}
                </Badge>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
