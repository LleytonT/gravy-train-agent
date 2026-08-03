import { InboundAlertsCard } from "@/components/profile/inbound-alerts-card";
import { TelegramStatusCard } from "@/components/product/telegram-status-card";
import {
  ensureInboundAlias,
  getInboundIngestionStatus,
} from "@/agent/lib/ingestion";
import { getMemberContextSnapshot } from "@/agent/lib/career-profile";
import { Badge } from "@/components/ui/badge";
import { requireAuthenticatedMember } from "@/lib/auth/member";

export const dynamic = "force-dynamic";

export default async function AppProfilePage() {
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
  let snapshot: Awaited<ReturnType<typeof getMemberContextSnapshot>> | null =
    null;
  try {
    snapshot = await getMemberContextSnapshot(member.id);
  } catch {
    snapshot = null;
  }

  const identity = snapshot?.identity;

  return (
    <div className="animate-fade-in mx-auto w-full max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Profile &amp; connections
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Career snapshot, inbound alert address, and Telegram — each configured
          independently.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-semibold">Career snapshot</h2>
        {identity?.currentTitle ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {identity.roleFamily ? (
                <Badge variant="secondary">{identity.roleFamily}</Badge>
              ) : null}
              {identity.location ? (
                <Badge variant="outline">{identity.location}</Badge>
              ) : null}
            </div>
            <p className="font-display text-xl font-semibold">
              {identity.currentTitle}
              {identity.currentCompany ? ` · ${identity.currentCompany}` : ""}
            </p>
            {identity.summary ? (
              <p className="text-sm text-muted-foreground">{identity.summary}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Complete get-started onboarding to persist a career snapshot.
          </p>
        )}
      </section>

      <InboundAlertsCard
        initialStatus={status}
        provisionError={provisionError}
        memberEmail={member.email}
      />

      <TelegramStatusCard />
    </div>
  );
}
