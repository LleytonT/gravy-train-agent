"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type InboundStatusClient = {
  alias: {
    address: string;
    status: string;
    connectedAt: string | Date;
    revokedAt: string | Date | null;
  } | null;
  domainConfigured: boolean;
  domain: string | null;
  recentReceiptCount: number;
  recentQuarantineCount: number;
  lastReceivedAt: string | Date | null;
  lastQuarantineAt: string | Date | null;
  lastQuarantineReason: string | null;
};

function formatWhen(value: string | Date | null | undefined): string {
  if (!value) return "Never";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

type Props = {
  initialStatus: InboundStatusClient;
  provisionError: string | null;
  memberEmail: string | null;
};

export function InboundAlertsCard({
  initialStatus,
  provisionError,
  memberEmail,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(provisionError);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  async function refreshFrom(response: Response) {
    const body = (await response.json()) as {
      ok?: boolean;
      error?: string;
      status?: InboundStatusClient;
    };
    if (!response.ok || !body.status) {
      throw new Error(body.error ?? "Request failed");
    }
    setStatus(body.status);
    setError(null);
  }

  function createAlias() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/inbound/alias", { method: "POST" });
        await refreshFrom(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create alias");
      }
    });
  }

  function revokeAlias() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/inbound/alias", { method: "DELETE" });
        await refreshFrom(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not revoke alias");
      }
    });
  }

  async function copyAddress() {
    if (!status.alias?.address) return;
    await navigator.clipboard.writeText(status.alias.address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inbound job-alert email</CardTitle>
        <CardDescription>
          Subscribe LinkedIn, Seek, Indeed, or other boards to this address, or
          forward alerts from {memberEmail ?? "your inbox"}. Gravy Scout stores
          listing excerpts only; full message bodies are retained briefly for
          debugging (see retention policy).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!status.domainConfigured ? (
          <p className="text-amber-700 dark:text-amber-400">
            Inbound domain is not configured yet (`RESEND_INBOUND_DOMAIN`).
            After Resend Marketplace provisioning, set the receiving domain and
            reload this page.
          </p>
        ) : null}

        {status.alias ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your address
            </p>
            <p className="break-all font-mono text-base text-foreground">
              {status.alias.address}
            </p>
            <p className="text-muted-foreground">
              Status: {status.alias.status} · created{" "}
              {formatWhen(status.alias.connectedAt)}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">
            No active inbound address. Create one to start receiving alerts.
          </p>
        )}

        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Copy your Gravy Scout inbound address.</li>
          <li>
            In LinkedIn / Seek / Indeed, create or edit a job alert and set the
            delivery email to this address (or forward existing alerts).
          </li>
          <li>
            When mail arrives, listings appear as source items for discovery.
            Retries never duplicate the same listing receipt.
          </li>
        </ol>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Listings ingested
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {status.recentReceiptCount}
            </p>
            <p className="text-xs text-muted-foreground">
              Last received: {formatWhen(status.lastReceivedAt)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Quarantine
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {status.recentQuarantineCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {status.lastQuarantineReason
                ? `${status.lastQuarantineReason} · ${formatWhen(status.lastQuarantineAt)}`
                : `Last error: ${formatWhen(status.lastQuarantineAt)}`}
            </p>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {status.alias ? (
          <>
            <Button type="button" onClick={copyAddress} disabled={pending}>
              {copied ? "Copied" : "Copy address"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={revokeAlias}
              disabled={pending}
            >
              Revoke address
            </Button>
          </>
        ) : (
          <Button
            type="button"
            onClick={createAlias}
            disabled={pending || !status.domainConfigured}
          >
            Create inbound address
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
