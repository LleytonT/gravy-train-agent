"use client";

import type { OnboardingMatch } from "@/agent/lib/onboarding-types";
import { Button } from "@/components/ui/button";

import { MatchesCard } from "./matches-card";
import { SUGGESTIONS } from "./types";

type ChatEmptyProps = {
  onSuggestion: (prompt: string) => void;
  disabled?: boolean;
  matches?: OnboardingMatch[];
  identityLabel?: string;
};

export function ChatEmpty({
  onSuggestion,
  disabled,
  matches,
  identityLabel,
}: ChatEmptyProps) {
  const hasMatches = Boolean(matches && matches.length > 0);

  const prompts = hasMatches
    ? [
        "What should I prioritize this week?",
        "Ask me about interests I haven't covered",
        "Who should I talk to first?",
        "Add a company to my watchlist",
      ]
    : SUGGESTIONS;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-10 md:px-6">
      <div className="animate-rise">
        <p className="font-mono text-[11px] tracking-[0.18em] text-primary uppercase">
          Career advisor
        </p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] font-semibold tracking-tight md:text-6xl">
          Gravy Scout
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground text-balance">
          {hasMatches
            ? `Personalized seats for ${identityLabel ?? "your profile"}. Explore a match or keep chatting — I’ll remember as we go.`
            : "Tell me your role once. I’ll map gravy-train seats and who to reach out to."}
        </p>
      </div>

      {hasMatches ? (
        <div className="mt-8">
          <MatchesCard
            matches={matches!}
            onExplore={onSuggestion}
            disabled={disabled}
          />
        </div>
      ) : null}

      <div
        className="animate-rise mt-8 grid gap-2 sm:grid-cols-2"
        style={{ animationDelay: "90ms" }}
      >
        {prompts.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onSuggestion(suggestion)}
            className="h-auto justify-start whitespace-normal rounded-xl px-4 py-3.5 text-left text-sm leading-6 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-primary"
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}
