import Link from "next/link";
import { notFound } from "next/navigation";

import { getMemberOpportunity } from "@/agent/lib/opportunities";
import { OpportunityDetailView } from "@/components/product/opportunity-detail";
import { Button } from "@/components/ui/button";
import { requireAuthenticatedMember } from "@/lib/auth/member";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function OpportunityDetailPage({ params }: PageProps) {
  const member = await requireAuthenticatedMember();
  const { id } = await params;
  const opportunity = await getMemberOpportunity(member.id, id);
  if (!opportunity) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/app/opportunities">← Opportunities</Link>
      </Button>
      <OpportunityDetailView initial={opportunity} />
    </div>
  );
}
