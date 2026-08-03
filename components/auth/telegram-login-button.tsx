"use client";

import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    onGravyScoutTelegramAuth?: (user: TelegramUser) => void;
  }
}

type TelegramLoginButtonProps = {
  onAuthenticated: () => void;
  botUsername?: string | null;
};

export function TelegramLoginButton({
  onAuthenticated,
  botUsername: botUsernameProp,
}: TelegramLoginButtonProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [botUsername, setBotUsername] = useState<string | null>(
    botUsernameProp ?? null,
  );
  const [configured, setConfigured] = useState<boolean | null>(
    botUsernameProp ? true : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (botUsernameProp) return;
    void fetch("/api/auth/telegram")
      .then((res) => res.json())
      .then((data: { configured?: boolean; botUsername?: string | null }) => {
        setConfigured(Boolean(data.configured));
        setBotUsername(data.botUsername ?? null);
      })
      .catch(() => {
        setConfigured(false);
      });
  }, [botUsernameProp]);

  useEffect(() => {
    if (!botUsername || !hostRef.current) return;

    window.onGravyScoutTelegramAuth = async (user) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(user),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error ?? "Telegram verification failed");
        }
        onAuthenticated();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Telegram login failed");
      } finally {
        setBusy(false);
      }
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "onGravyScoutTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    hostRef.current.innerHTML = "";
    hostRef.current.appendChild(script);

    return () => {
      delete window.onGravyScoutTelegramAuth;
    };
  }, [botUsername, onAuthenticated]);

  async function continueLocalDev() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ intent: "local-dev" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Local session failed");
      }
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Local session failed");
    } finally {
      setBusy(false);
    }
  }

  if (configured === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        Checking Telegram…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {configured && botUsername ? (
        <div ref={hostRef} className="min-h-10" aria-label="Verify with Telegram" />
      ) : (
        <Alert>
          <AlertDescription>
            Telegram Login is not configured in this environment. On localhost
            you can continue with a local member session for development.
          </AlertDescription>
        </Alert>
      )}
      {process.env.NODE_ENV !== "production" ? (
        <Button
          type="button"
          variant={configured ? "outline" : "default"}
          onClick={() => void continueLocalDev()}
          disabled={busy}
        >
          {busy ? "Starting…" : "Continue on localhost"}
        </Button>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
