"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  DispositionAction,
  OpportunityDetail,
} from "@/agent/lib/opportunities";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

const dispositions: { id: DispositionAction; label: string }[] = [
  { id: "saved", label: "Save" },
  { id: "pursuing", label: "Pursue" },
  { id: "dismissed", label: "Dismiss" },
  { id: "not_interested", label: "Not interested" },
];

export function OpportunityDetailView({
  initial,
}: {
  initial: OpportunityDetail;
}) {
  const router = useRouter();
  const [opportunity, setOpportunity] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setDisposition(disposition: DispositionAction) {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/opportunities/${opportunity.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ disposition }),
      });
      const data = (await res.json()) as {
        opportunity?: OpportunityDetail;
        error?: string;
      };
      if (!res.ok || !data.opportunity) {
        setError(data.error ?? "Could not update disposition");
        return;
      }
      setOpportunity(data.opportunity);
      router.refresh();
    });
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{opportunity.companyName}</Badge>
          {opportunity.roleKind ? (
            <Badge variant="outline">{opportunity.roleKind}</Badge>
          ) : null}
          {opportunity.disposition ? (
            <Badge className="capitalize">
              {opportunity.disposition.replace("_", " ")}
            </Badge>
          ) : null}
        </div>
        <h1 className="max-w-3xl font-display text-3xl font-semibold tracking-tight md:text-5xl">
          {opportunity.headline}
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          {opportunity.rationale ?? "Evidence-backed fit details below."}
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Score", opportunity.score.toFixed(1)],
          [
            "Freshness",
            opportunity.freshnessDays == null
              ? "—"
              : opportunity.freshnessDays === 0
                ? "Today"
                : `${opportunity.freshnessDays}d`,
          ],
          [
            "Confidence",
            opportunity.confidence != null
              ? `${Math.round(opportunity.confidence * 100)}%`
              : "—",
          ],
          ["Fit / risk", `${opportunity.fit?.toFixed(1) ?? "—"} / ${opportunity.risk?.toFixed(1) ?? "—"}`],
        ].map(([label, value]) => (
          <div key={label} className="border-t border-border pt-3">
            <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-1 font-display text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Disposition</h2>
        <div className="flex flex-wrap gap-2">
          {dispositions.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={opportunity.disposition === item.id ? "default" : "outline"}
              disabled={pending}
              onClick={() => setDisposition(item.id)}
            >
              {pending ? <Spinner className="size-3" /> : null}
              {item.label}
            </Button>
          ))}
        </div>
        {opportunity.nextAction ? (
          <p className="text-sm text-muted-foreground">
            Next action: {opportunity.nextAction}
          </p>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">Evidence</h2>
        {opportunity.evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cited signals yet. Discovery will attach evidence as signals land.
          </p>
        ) : (
          <ul className="space-y-4">
            {opportunity.evidence.map((item) => (
              <li key={item.signalId} className="border-t border-border pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{item.type}</Badge>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {item.direction} · strength {item.strength}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {new Date(item.observedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6">{item.summary}</p>
                {item.excerpt ? (
                  <p className="mt-1 text-sm text-muted-foreground italic">
                    “{item.excerpt}”
                  </p>
                ) : null}
                {item.sourceUrl ? (
                  <a
                    href={item.sourceUrl}
                    className="mt-2 inline-block text-sm text-signal underline-offset-4 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
