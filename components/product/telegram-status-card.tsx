"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

type LinkStatus = {
  linked: boolean;
  username?: string | null;
  consentUpdates?: boolean;
  configured?: boolean;
  botUsername?: string | null;
  deepLink?: string | null;
  expiresAt?: string | null;
  error?: string;
};

export function TelegramStatusCard() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/telegram/link", { credentials: "include" });
    const data = (await res.json()) as LinkStatus;
    if (!res.ok) {
      setError(data.error ?? "Could not load Telegram status");
      return;
    }
    setStatus(data);
    setError(null);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function mintLink() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/link", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as LinkStatus;
      if (!res.ok) throw new Error(data.error ?? "Could not create link");
      setStatus((prev) => ({ ...prev, ...data, linked: prev?.linked ?? false }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create link");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/link", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Could not disconnect");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect");
    } finally {
      setBusy(false);
    }
  }

  if (!status && !error) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        Loading Telegram…
      </div>
    );
  }

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-semibold">Telegram</h2>
        <p className="text-sm text-muted-foreground">
          Digests and chat sync use your verified Telegram user ID. Username is
          display-only.
        </p>
      </div>

      {status?.linked ? (
        <div className="space-y-3">
          <p className="text-sm">
            Linked
            {status.username ? (
              <>
                {" "}
                as <span className="font-mono">@{status.username}</span>
              </>
            ) : null}
            .
          </p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void revoke()}>
            Disconnect Telegram
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {status?.configured
              ? "If you signed in with Telegram Login, the channel is already verified. Mint a reconnect link only if the bot chat is missing."
              : "Telegram bot is not configured in this environment."}
          </p>
          <div className="space-y-2">
            <Label>Reconnect deep link</Label>
            <Button size="sm" disabled={busy || !status?.configured} onClick={() => void mintLink()}>
              {busy ? <Spinner className="size-3" /> : null}
              Create one-time link
            </Button>
            {status?.deepLink ? (
              <a
                href={status.deepLink}
                className="block break-all text-sm text-signal underline-offset-4 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {status.deepLink}
              </a>
            ) : null}
          </div>
        </div>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
