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
import type { SessionState } from "eve/client";
import { useEveAgent } from "eve/react";
import { useEffect, useRef, useState } from "react";

import { ChatComposer } from "./chat-composer";
import { ChatEmpty } from "./chat-empty";
import {
  beginTurn,
  completeTurn,
  extractAssistantText,
  syncTurnSession,
} from "./conversation-api";
import { DurableMessageBubble } from "./durable-message";
import { MessageBubble } from "./message-parts";
import type { ChatConversation, DurableChatMessage } from "./types";

type ChatPanelProps = {
  conversation: ChatConversation;
  initialMessages: DurableChatMessage[];
  initialSession?: SessionState;
  onConversationMeta: (conversation: ChatConversation) => void;
  onMessagesChange: (messages: DurableChatMessage[]) => void;
  sidebarToggle: React.ReactNode;
  matches?: OnboardingMatch[];
  identityLabel?: string;
  autoKickoffMessage?: string | null;
  onKickoffSent?: () => void;
};

export function ChatPanel({
  conversation,
  initialMessages,
  initialSession,
  onConversationMeta,
  onMessagesChange,
  sidebarToggle,
  matches,
  identityLabel,
  autoKickoffMessage,
  onKickoffSent,
}: ChatPanelProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [durableMessages, setDurableMessages] =
    useState<DurableChatMessage[]>(initialMessages);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  const agent = useEveAgent({
    initialEvents: [],
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
    async onFinish(snapshot) {
      const session = snapshot.session;
      if (!session?.sessionId) return;

      const assistantBody = extractAssistantText(snapshot.data.messages);
      if (!assistantBody) {
        await syncTurnSession(conversation.id, {
          eveSessionId: session.sessionId,
          continuationToken: session.continuationToken,
          streamIndex: session.streamIndex,
        });
        return;
      }

      const turnId =
        session.continuationToken ??
        `${session.sessionId}:${session.streamIndex ?? 0}`;
      try {
        const assistantMessage = await completeTurn(conversation.id, {
          assistantBody,
          assistantIdempotencyKey: `assistant:web:${turnId}`,
          eveSessionId: session.sessionId,
          continuationToken: session.continuationToken,
          streamIndex: session.streamIndex,
        });
        setDurableMessages((prev) => {
          if (prev.some((message) => message.id === assistantMessage.id)) {
            return prev;
          }
          const next = [...prev, assistantMessage];
          onMessagesChange(next);
          return next;
        });
        onConversationMeta({
          ...conversation,
          updatedAt: Date.now(),
        });
      } catch (error) {
        setBridgeError(
          error instanceof Error
            ? error.message
            : "Failed to persist assistant reply",
        );
      }
    },
  });

  const liveMessages = agent.data.messages;
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const kickoffStarted = useRef(false);
  const sendMessageRef = useRef<(message: string) => Promise<void>>(
    async () => undefined,
  );

  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!agent.session?.sessionId) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      void syncTurnSession(conversation.id, {
        eveSessionId: agent.session!.sessionId!,
        continuationToken: agent.session!.continuationToken,
        streamIndex: agent.session!.streamIndex,
      }).catch(() => {
        // Best-effort mid-stream cursor sync for reconnect recovery.
      });
    }, 800);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [agent.session, conversation.id]);

  sendMessageRef.current = async (message: string) => {
    if (!isLoaded || !isSignedIn) {
      throw new Error("Sign in required to chat with Gravy Scout");
    }
    setBridgeError(null);
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `member:web:${crypto.randomUUID()}`
        : `member:web:${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const began = await beginTurn(conversation.id, {
      body: message,
      idempotencyKey,
      titleFromBody: true,
    });

    onConversationMeta(began.conversation);
    setDurableMessages((prev) => {
      if (prev.some((row) => row.id === began.message.id)) return prev;
      const next = [...prev, began.message];
      onMessagesChange(next);
      return next;
    });

    const evePayload =
      began.shouldInjectContext && began.contextPrefix
        ? `${began.contextPrefix}\n\n---\n\n${message}`
        : message;

    await agent.send({ message: evePayload });
  };

  useEffect(() => {
    if (!autoKickoffMessage) return;
    if (!isLoaded || !isSignedIn) return;
    if (kickoffStarted.current) return;
    if (durableMessages.length > 0) return;
    if (liveMessages.length > 0) return;

    kickoffStarted.current = true;
    void sendMessageRef.current(autoKickoffMessage).finally(() => {
      onKickoffSent?.();
    });
  }, [
    autoKickoffMessage,
    durableMessages.length,
    isLoaded,
    isSignedIn,
    liveMessages.length,
    onKickoffSent,
  ]);

  async function sendMessage(message: string) {
    if (!isLoaded || !isSignedIn) {
      throw new Error("Sign in required to chat with Gravy Scout");
    }
    await sendMessageRef.current(message);
  }

  const showEmpty =
    durableMessages.length === 0 &&
    liveMessages.length === 0 &&
    !autoKickoffMessage;

  const showKickoffPlaceholder =
    durableMessages.length === 0 &&
    liveMessages.length === 0 &&
    Boolean(autoKickoffMessage);

  // Member lines are already in the durable timeline. While streaming, only
  // show live assistant/tool parts (Eve may wrap the turn with context).
  const streamingLive = busy
    ? liveMessages.filter((message) => message.role !== "user")
    : [];

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
              {conversation.title}
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
            Reset session
          </Button>
        </div>
      </header>
      <Separator />

      {showEmpty ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChatEmpty
            onSuggestion={(prompt) => void sendMessage(prompt)}
            disabled={busy}
            matches={matches}
            identityLabel={identityLabel}
          />
        </div>
      ) : showKickoffPlaceholder ? (
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
            {durableMessages.map((message) => (
              <DurableMessageBubble key={message.id} message={message} />
            ))}
            {streamingLive.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {bridgeError || agent.error ? (
        <div className="mx-auto w-full max-w-3xl px-4 pb-2 md:px-6">
          <Alert variant="destructive">
            <AlertDescription>
              {bridgeError ?? agent.error?.message}
            </AlertDescription>
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
