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

type TelegramAuthConfig = {
  configured?: boolean;
  botUsername?: string | null;
  loginDomain?: string | null;
  widgetDomainValid?: boolean | null;
  widgetDomainDetail?: string | null;
  deepLinkLoginAvailable?: boolean;
};

type TelegramLoginButtonProps = {
  onAuthenticated: () => void;
  botUsername?: string | null;
};

export function TelegramLoginButton({
  onAuthenticated,
  botUsername: botUsernameProp,
}: TelegramLoginButtonProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<TelegramAuthConfig | null>(
    botUsernameProp
      ? { configured: true, botUsername: botUsernameProp, deepLinkLoginAvailable: true }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    deepLink: string | null;
    botUsername: string | null;
  } | null>(null);
  const [waitingForTelegram, setWaitingForTelegram] = useState(false);

  const botUsername = config?.botUsername ?? botUsernameProp ?? null;
  const configured = config?.configured ?? Boolean(botUsernameProp);
  const widgetOk = config?.widgetDomainValid === true;
  const deepLinkOk = Boolean(config?.deepLinkLoginAvailable ?? configured);

  useEffect(() => {
    void fetch("/api/auth/telegram")
      .then((res) => res.json())
      .then((data: TelegramAuthConfig) => {
        setConfig({
          configured: Boolean(data.configured),
          botUsername: data.botUsername ?? botUsernameProp ?? null,
          loginDomain: data.loginDomain ?? null,
          widgetDomainValid: data.widgetDomainValid ?? null,
          widgetDomainDetail: data.widgetDomainDetail ?? null,
          deepLinkLoginAvailable: Boolean(
            data.deepLinkLoginAvailable ?? data.configured,
          ),
        });
      })
      .catch(() => {
        setConfig({
          configured: Boolean(botUsernameProp),
          botUsername: botUsernameProp ?? null,
          widgetDomainValid: false,
          deepLinkLoginAvailable: Boolean(botUsernameProp),
          widgetDomainDetail: "Could not load Telegram Login configuration",
        });
      });
  }, [botUsernameProp]);

  useEffect(() => {
    if (!widgetOk || !botUsername || !hostRef.current) return;

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
  }, [botUsername, onAuthenticated, widgetOk]);

  useEffect(() => {
    if (!waitingForTelegram || !challenge?.challengeId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/auth/telegram/challenge?challengeId=${encodeURIComponent(challenge.challengeId)}`,
          { credentials: "include" },
        );
        const data = (await res.json()) as {
          status?: string;
          error?: string;
        };
        if (cancelled) return;
        if (data.status === "ready") {
          const complete = await fetch("/api/auth/telegram/challenge", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              intent: "complete",
              challengeId: challenge.challengeId,
            }),
          });
          const completeData = (await complete.json()) as { error?: string };
          if (!complete.ok) {
            throw new Error(completeData.error ?? "Could not finish Telegram login");
          }
          setWaitingForTelegram(false);
          setBusy(false);
          onAuthenticated();
          return;
        }
        if (data.status === "expired" || res.status === 410) {
          throw new Error("That Telegram link expired. Start again.");
        }
        if (data.status === "not_found" || res.status === 404) {
          throw new Error("That Telegram link was not recognized. Start again.");
        }
      } catch (err) {
        if (cancelled) return;
        setWaitingForTelegram(false);
        setBusy(false);
        setError(err instanceof Error ? err.message : "Telegram login failed");
        return;
      }
      timer = setTimeout(() => {
        void poll();
      }, 2000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [challenge?.challengeId, onAuthenticated, waitingForTelegram]);

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

  async function startDeepLinkLogin() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/telegram/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ intent: "start" }),
      });
      const data = (await res.json()) as {
        error?: string;
        challengeId?: string;
        deepLink?: string | null;
        botUsername?: string | null;
      };
      if (!res.ok || !data.challengeId) {
        throw new Error(data.error ?? "Could not start Telegram login");
      }
      setChallenge({
        challengeId: data.challengeId,
        deepLink: data.deepLink ?? null,
        botUsername: data.botUsername ?? botUsername,
      });
      setWaitingForTelegram(true);
      if (data.deepLink) {
        window.open(data.deepLink, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Telegram login failed");
    }
  }

  if (config === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        Checking Telegram…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {configured && botUsername && widgetOk ? (
        <div ref={hostRef} className="min-h-10" aria-label="Verify with Telegram" />
      ) : null}

      {configured && deepLinkOk ? (
        <div className="space-y-2">
          {config.widgetDomainValid === false ? (
            <Alert>
              <AlertDescription>
                Telegram’s Login Widget domain is not registered for this site
                {config.loginDomain ? ` (${config.loginDomain})` : ""}. Use the
                deep link below — it works without BotFather /setdomain. To restore
                the widget, message @BotFather → /setdomain → @{botUsername} →{" "}
                {config.loginDomain ?? "gravy.sh"}.
              </AlertDescription>
            </Alert>
          ) : null}
          <Button
            type="button"
            onClick={() => void startDeepLinkLogin()}
            disabled={busy || waitingForTelegram}
          >
            {waitingForTelegram
              ? "Waiting for Telegram…"
              : widgetOk
                ? `Or open @${botUsername} to verify`
                : `Open @${botUsername} to verify`}
          </Button>
          {waitingForTelegram && challenge?.deepLink ? (
            <p className="text-sm text-muted-foreground">
              Tap Start in Telegram, then return here.{" "}
              <a
                className="underline underline-offset-2"
                href={challenge.deepLink}
                target="_blank"
                rel="noreferrer"
              >
                Open link again
              </a>
            </p>
          ) : null}
        </div>
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
          {busy && !waitingForTelegram ? "Starting…" : "Continue on localhost"}
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
