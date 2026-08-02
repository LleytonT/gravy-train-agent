import Link from "next/link";

import { listMemberOpportunities } from "@/agent/lib/opportunities";
import { OpportunityCardView } from "@/components/product/opportunity-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireAuthenticatedMember } from "@/lib/auth/member";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const member = await requireAuthenticatedMember();
  let items: Awaited<ReturnType<typeof listMemberOpportunities>> = [];
  let loadError: string | null = null;

  try {
    items = await listMemberOpportunities(member.id, { limit: 50 });
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Could not load opportunities";
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Opportunities
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Every member-specific hypothesis with score, evidence count, and next
            action.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/app">Back to Today</Link>
        </Button>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Reconnect required</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {!loadError && items.length === 0 ? (
        <div className="space-y-3 border-t border-border pt-6">
          <h2 className="font-display text-2xl font-semibold">No opportunities yet</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Once discovery scores a candidate role against your career profile,
            it appears here with citations.
          </p>
          <Button asChild>
            <Link href="/app/profile">Check connections</Link>
          </Button>
        </div>
      ) : null}

      <div>
        {items.map((opportunity) => (
          <OpportunityCardView key={opportunity.id} opportunity={opportunity} />
        ))}
      </div>
    </div>
  );
}
