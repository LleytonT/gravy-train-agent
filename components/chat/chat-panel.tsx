"use client";

import type { OnboardingMatch } from "@/agent/lib/onboarding-types";
import type { HandleMessageStreamEvent, SessionState } from "eve/client";
import { useEveAgent } from "eve/react";
import { useEffect, useRef } from "react";

import { ChatComposer } from "./chat-composer";
import { ChatEmpty } from "./chat-empty";
import { MessageBubble } from "./message-parts";

type ChatPanelProps = {
  threadId: string;
  initialEvents?: readonly HandleMessageStreamEvent[];
  initialSession?: SessionState;
  onPersist: (snapshot: {
    events: readonly HandleMessageStreamEvent[];
    session?: SessionState;
  }) => void;
  onTitleSeed: (prompt: string) => void;
  sidebarToggle: React.ReactNode;
  matches?: OnboardingMatch[];
  identityLabel?: string;
  /** Auto-send once after onboarding (career-advisor kickoff). */
  autoKickoffMessage?: string | null;
  onKickoffSent?: () => void;
};

export function ChatPanel({
  threadId,
  initialEvents,
  initialSession,
  onPersist,
  onTitleSeed,
  sidebarToggle,
  matches,
  identityLabel,
  autoKickoffMessage,
  onKickoffSent,
}: ChatPanelProps) {
  const agent = useEveAgent({
    initialEvents: initialEvents ?? [],
    initialSession,
    onFinish(snapshot) {
      onPersist({
        events: snapshot.events,
        session: snapshot.session,
      });
    },
  });

  const messages = agent.data.messages;
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const scrollerRef = useRef<HTMLDivElement>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kickoffStarted = useRef(false);
  const sendRef = useRef(agent.send);
  sendRef.current = agent.send;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, agent.status]);

  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      onPersist({
        events: agent.events,
        session: agent.session,
      });
    }, 350);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [agent.events, agent.session, onPersist]);

  useEffect(() => {
    if (!autoKickoffMessage) return;
    if (kickoffStarted.current) return;
    if ((initialEvents?.length ?? 0) > 0) return;
    if (messages.length > 0) return;

    kickoffStarted.current = true;
    onTitleSeed(autoKickoffMessage);
    void sendRef.current({ message: autoKickoffMessage }).finally(() => {
      onKickoffSent?.();
    });
  }, [
    autoKickoffMessage,
    initialEvents,
    messages.length,
    onKickoffSent,
    onTitleSeed,
  ]);

  async function sendMessage(message: string) {
    if (messages.length === 0) onTitleSeed(message);
    await agent.send({ message });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          {sidebarToggle}
          <div>
            <p className="font-display text-sm font-semibold tracking-tight text-ink md:hidden">
              Gravy Scout
            </p>
            <p className="hidden font-mono text-[11px] tracking-[0.18em] text-ink-muted uppercase md:block">
              Session {threadId.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {busy ? (
            <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-[11px] tracking-wide text-ink-muted uppercase">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal" />
              Streaming
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => agent.reset()}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-muted transition hover:border-line-strong hover:text-ink"
          >
            Reset
          </button>
        </div>
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && !autoKickoffMessage ? (
          <ChatEmpty
            onSuggestion={(prompt) => void sendMessage(prompt)}
            disabled={busy}
            matches={matches}
            identityLabel={identityLabel}
          />
        ) : messages.length === 0 && autoKickoffMessage ? (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 md:px-6">
            {matches && matches.length > 0 ? (
              <MatchesCardBridge
                matches={matches}
                identityLabel={identityLabel}
                onExplore={(prompt) => void sendMessage(prompt)}
                disabled={busy}
              />
            ) : (
              <p className="text-sm text-ink-muted">Starting your advisor…</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5 py-6 md:gap-6 md:py-8">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        )}
      </div>

      {agent.error ? (
        <div className="mx-auto w-full max-w-3xl px-4 pb-2 md:px-6">
          <p className="rounded-xl border border-warn bg-warn-soft px-3 py-2 text-sm text-warn">
            {agent.error.message}
          </p>
        </div>
      ) : null}

      <ChatComposer
        busy={busy}
        onSend={(message) => void sendMessage(message)}
        onStop={() => agent.stop()}
      />
    </div>
  );
}

function MatchesCardBridge({
  matches,
  identityLabel,
  onExplore,
  disabled,
}: {
  matches: OnboardingMatch[];
  identityLabel?: string;
  onExplore: (prompt: string) => void;
  disabled?: boolean;
}) {
  return (
    <ChatEmpty
      onSuggestion={onExplore}
      disabled={disabled}
      matches={matches}
      identityLabel={identityLabel}
    />
  );
}
