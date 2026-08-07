import Link from "next/link";

import { listMemberOpportunities } from "@/agent/lib/opportunities";
import { OpportunityCardView } from "@/components/product/opportunity-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireAuthenticatedMember } from "@/lib/auth/member";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const member = await requireAuthenticatedMember();
  let items: Awaited<ReturnType<typeof listMemberOpportunities>> = [];
  let loadError: string | null = null;

  try {
    items = await listMemberOpportunities(member.id, { limit: 8 });
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Could not load opportunities";
  }

  const actionable = items.filter(
    (item) => item.status !== "dismissed" && item.disposition !== "not_interested",
  );

  return (
    <div className="animate-fade-in space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Today
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Fresh, high-signal opportunities for {member.displayName ?? "you"}.
          Disposition changes show up here and in Opportunities immediately.
        </p>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load Today</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {!loadError && actionable.length === 0 ? (
        <div className="space-y-4 border-t border-border pt-6">
          <h2 className="font-display text-2xl font-semibold">Quiet for now</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            No scored opportunities yet. Forward job alerts to your inbound
            address or talk with the scout while discovery runs.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/app/profile">Configure alerts</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/conversation">Open conversation</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        {actionable.map((opportunity) => (
          <OpportunityCardView key={opportunity.id} opportunity={opportunity} />
        ))}
      </div>
    </div>
  );
}
