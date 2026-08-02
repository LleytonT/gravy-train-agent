"use client";

import type { OnboardingMatch } from "@/agent/lib/onboarding-types";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@clerk/nextjs";
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
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const agent = useEveAgent({
    initialEvents: initialEvents ?? [],
    initialSession,
    auth: {
      bearer: async () => {
        if (!isLoaded) {
          throw new Error("Waiting for sign-in before starting chat");
        }
        const token = await getToken();
        if (!token) {
          throw new Error("Sign in required to chat with Gravy Scout");
        }
        return token;
      },
    },
    onFinish(snapshot) {
      onPersist({
        events: snapshot.events,
        session: snapshot.session,
      });
    },
  });

  const messages = agent.data.messages;
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kickoffStarted = useRef(false);
  const sendRef = useRef(agent.send);
  sendRef.current = agent.send;

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
    if (!isLoaded || !isSignedIn) return;
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
    isLoaded,
    isSignedIn,
    messages.length,
    onKickoffSent,
    onTitleSeed,
  ]);

  async function sendMessage(message: string) {
    if (!isLoaded || !isSignedIn) {
      throw new Error("Sign in required to chat with Gravy Scout");
    }
    if (messages.length === 0) onTitleSeed(message);
    await agent.send({ message });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          {sidebarToggle}
          <div>
            <p className="font-display text-sm font-semibold tracking-tight md:hidden">
              Gravy Scout
            </p>
            <p className="hidden font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase md:block">
              Session {threadId.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {busy ? (
            <Badge variant="outline" className="gap-2 font-mono text-[11px] uppercase">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-primary" />
              Streaming
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => agent.reset()}
          >
            Reset
          </Button>
        </div>
      </header>
      <Separator />

      {messages.length === 0 && !autoKickoffMessage ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChatEmpty
            onSuggestion={(prompt) => void sendMessage(prompt)}
            disabled={busy}
            matches={matches}
            identityLabel={identityLabel}
          />
        </div>
      ) : messages.length === 0 && autoKickoffMessage ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 md:px-6">
            {matches && matches.length > 0 ? (
              <ChatEmpty
                onSuggestion={(prompt) => void sendMessage(prompt)}
                disabled={busy}
                matches={matches}
                identityLabel={identityLabel}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Starting your advisor…</p>
            )}
          </div>
        </div>
      ) : (
        <Conversation className="min-h-0">
          <ConversationContent className="mx-auto w-full max-w-3xl gap-5 px-0 py-6 md:gap-6 md:py-8">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {agent.error ? (
        <div className="mx-auto w-full max-w-3xl px-4 pb-2 md:px-6">
          <Alert variant="destructive">
            <AlertDescription>{agent.error.message}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <ChatComposer
        busy={busy}
        status={agent.status as "submitted" | "streaming" | "ready" | "error"}
        onSend={(message) => void sendMessage(message)}
        onStop={() => agent.stop()}
      />
    </div>
  );
}
