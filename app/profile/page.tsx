import { SiteHeader } from "@/components/site-header";
import { InboundAlertsCard } from "@/components/profile/inbound-alerts-card";
import {
  ensureInboundAlias,
  getInboundIngestionStatus,
} from "@/agent/lib/ingestion";
import { requireAuthenticatedMember } from "@/lib/auth/member";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const member = await requireAuthenticatedMember();

  let provisionError: string | null = null;
  try {
    if (process.env.RESEND_INBOUND_DOMAIN?.trim()) {
      await ensureInboundAlias(member.id);
    }
  } catch (error) {
    provisionError =
      error instanceof Error ? error.message : "Could not provision alias";
  }

  const status = await getInboundIngestionStatus(member.id);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader active="profile" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Profile &amp; connections
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Manage how Gravy Scout receives job-board alerts. Forward or
            subscribe alerts to your private inbound address — no mailbox-wide
            access required.
          </p>
        </div>
        <InboundAlertsCard
          initialStatus={status}
          provisionError={provisionError}
          memberEmail={member.email}
        />
      </main>
    </div>
  );
}
