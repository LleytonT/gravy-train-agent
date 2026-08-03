"use client";

import Link from "next/link";

import type { OpportunityCard as OpportunityCardData } from "@/agent/lib/opportunities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatScore(score: number) {
  return score.toFixed(1);
}

export function OpportunityCardView({
  opportunity,
  compact = false,
}: {
  opportunity: OpportunityCardData;
  compact?: boolean;
}) {
  return (
    <article
      className={cn(
        "group border-b border-border/70 py-4 transition-colors first:pt-0 last:border-b-0",
        "focus-within:bg-mist/40 hover:bg-mist/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
              {opportunity.companyName}
            </Badge>
            {opportunity.disposition ? (
              <Badge variant="outline" className="capitalize">
                {opportunity.disposition.replace("_", " ")}
              </Badge>
            ) : (
              <Badge className="bg-signal text-white">New</Badge>
            )}
            {opportunity.freshnessDays != null ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                {opportunity.freshnessDays === 0
                  ? "Today"
                  : `${opportunity.freshnessDays}d old`}
              </span>
            ) : null}
          </div>
          <h3 className="font-display text-xl leading-tight font-semibold tracking-tight md:text-2xl">
            <Link
              href={`/app/opportunities/${opportunity.id}`}
              className="outline-none hover:text-signal focus-visible:underline"
            >
              {opportunity.headline}
            </Link>
          </h3>
          {!compact && opportunity.rationale ? (
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {opportunity.rationale}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 font-mono text-[11px] text-muted-foreground">
            <span>Fit {opportunity.fit?.toFixed(1) ?? "—"}</span>
            <span>Risk {opportunity.risk?.toFixed(1) ?? "—"}</span>
            <span>
              Confidence{" "}
              {opportunity.confidence != null
                ? `${Math.round(opportunity.confidence * 100)}%`
                : "—"}
            </span>
            <span>{opportunity.evidenceCount} evidence</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="font-display text-3xl font-semibold text-signal">
            {formatScore(opportunity.score)}
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/app/opportunities/${opportunity.id}`}>Open</Link>
          </Button>
        </div>
      </div>
      {opportunity.nextAction ? (
        <p className="mt-3 text-sm text-foreground/80">
          Next: {opportunity.nextAction}
        </p>
      ) : null}
    </article>
  );
}
