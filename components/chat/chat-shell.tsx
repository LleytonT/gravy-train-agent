"use client";

import type { OnboardingMatch } from "@/agent/lib/onboarding-types";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import {
  clearOnboardingState,
  loadOnboardingState,
  saveOnboardingState,
  type OnboardingState,
} from "@/components/onboarding/onboarding-storage";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SessionState } from "eve/client";
import { PanelLeftIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ChatPanel } from "./chat-panel";
import { ChatSidebar } from "./chat-sidebar";
import {
  clearLegacyThreadStorage,
  createConversation,
  fetchConversations,
  fetchEveSession,
  fetchMessages,
  loadActiveConversationId,
  saveActiveConversationId,
} from "./conversation-api";
import type { ChatConversation, DurableChatMessage } from "./types";

export function ChatShell() {
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState>({
    completed: false,
  });
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [messagesById, setMessagesById] = useState<
    Record<string, DurableChatMessage[]>
  >({});
  const [sessionById, setSessionById] = useState<
    Record<string, SessionState | undefined>
  >({});
  const [loadedIds, setLoadedIds] = useState<Record<string, true>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelReady, setPanelReady] = useState(false);

  const loadWorkspace = useCallback(async () => {
    clearLegacyThreadStorage();
    setLoadError(null);
    setPanelReady(false);

    let list = await fetchConversations();
    if (list.length === 0) {
      const first = await createConversation();
      list = [first];
    }

    const savedActive = loadActiveConversationId();
    const nextActive =
      list.find((conversation) => conversation.id === savedActive)?.id ??
      list[0]!.id;

    const [messages, eveSession] = await Promise.all([
      fetchMessages(nextActive),
      fetchEveSession(nextActive),
    ]);

    setConversations(list);
    setActiveId(nextActive);
    saveActiveConversationId(nextActive);
    setMessagesById({ [nextActive]: messages });
    setSessionById({ [nextActive]: eveSession });
    setLoadedIds({ [nextActive]: true });
    setPanelReady(true);
  }, []);

  useEffect(() => {
    setOnboarding(loadOnboardingState());
    void loadWorkspace()
      .catch((error: unknown) => {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load conversations",
        );
      })
      .finally(() => setHydrated(true));
  }, [loadWorkspace]);

  const activeConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === activeId) ??
      conversations[0],
    [conversations, activeId],
  );

  const handleOnboardingComplete = useCallback(
    async (result: {
      identity: {
        name?: string;
        currentTitle?: string;
        currentCompany?: string;
        location?: string;
        roleFamily: string;
      };
      matches: OnboardingMatch[];
      kickoffMessage: string;
    }) => {
      const next: OnboardingState = {
        completed: true,
        completedAt: Date.now(),
        identity: {
          name: result.identity.name,
          currentTitle: result.identity.currentTitle,
          currentCompany: result.identity.currentCompany,
          location: result.identity.location,
          roleFamily: result.identity.roleFamily,
        },
        matches: result.matches,
        kickoffMessage: result.kickoffMessage,
        kickoffSent: false,
      };
      saveOnboardingState(next);
      setOnboarding(next);

      const conversation = await createConversation(
        `${result.identity.currentTitle ?? "Role"} → gravy train`,
      );
      setConversations((prev) => [conversation, ...prev]);
      setActiveId(conversation.id);
      saveActiveConversationId(conversation.id);
      setMessagesById((prev) => ({ ...prev, [conversation.id]: [] }));
      setSessionById((prev) => ({ ...prev, [conversation.id]: undefined }));
      setLoadedIds((prev) => ({ ...prev, [conversation.id]: true }));
      setPanelReady(true);
    },
    [],
  );

  const handleKickoffSent = useCallback(() => {
    setOnboarding((prev) => {
      const next = { ...prev, kickoffSent: true };
      saveOnboardingState(next);
      return next;
    });
  }, []);

  const handleRedoSetup = useCallback(() => {
    clearOnboardingState();
    setOnboarding({ completed: false });
    setSidebarOpen(false);
  }, []);

  const handleNewChat = useCallback(async () => {
    const conversation = await createConversation();
    setConversations((prev) => [conversation, ...prev]);
    setActiveId(conversation.id);
    saveActiveConversationId(conversation.id);
    setMessagesById((prev) => ({ ...prev, [conversation.id]: [] }));
    setSessionById((prev) => ({ ...prev, [conversation.id]: undefined }));
    setLoadedIds((prev) => ({ ...prev, [conversation.id]: true }));
    setSidebarOpen(false);
  }, []);

  const handleSelect = useCallback(
    async (id: string) => {
      setActiveId(id);
      saveActiveConversationId(id);
      setSidebarOpen(false);
      if (loadedIds[id]) {
        return;
      }
      const [messages, eveSession] = await Promise.all([
        fetchMessages(id),
        fetchEveSession(id),
      ]);
      setMessagesById((prev) => ({ ...prev, [id]: messages }));
      setSessionById((prev) => ({ ...prev, [id]: eveSession }));
      setLoadedIds((prev) => ({ ...prev, [id]: true }));
    },
    [loadedIds],
  );

  if (!hydrated) {
    return (
      <div className="grid min-h-dvh place-items-center gap-3">
        <Skeleton className="h-4 w-32" />
        <p className="text-sm text-muted-foreground">Loading scout</p>
      </div>
    );
  }

  if (!onboarding.completed) {
    return <OnboardingFlow onComplete={(result) => void handleOnboardingComplete(result)} />;
  }

  if (loadError) {
    return (
      <div className="grid min-h-dvh place-items-center gap-3 px-6 text-center">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button type="button" onClick={() => void loadWorkspace()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!activeConversation || !panelReady) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">
        Loading scout
      </div>
    );
  }

  const identityLabel = onboarding.identity
    ? [
        onboarding.identity.currentTitle,
        onboarding.identity.currentCompany
          ? `at ${onboarding.identity.currentCompany}`
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : undefined;

  const needsKickoff =
    Boolean(onboarding.kickoffMessage) && !onboarding.kickoffSent;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <SiteHeader active="chat" />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChatSidebar
          threads={conversations}
          activeId={activeConversation.id}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNewChat={() => void handleNewChat()}
          onSelect={(id) => void handleSelect(id)}
          onRedoSetup={handleRedoSetup}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-background/40">
          <ChatPanel
            key={activeConversation.id}
            conversation={activeConversation}
            initialMessages={messagesById[activeConversation.id] ?? []}
            initialSession={sessionById[activeConversation.id]}
            onConversationMeta={(conversation) => {
              setConversations((prev) => {
                const rest = prev.filter((row) => row.id !== conversation.id);
                return [conversation, ...rest];
              });
            }}
            onMessagesChange={(messages) => {
              setMessagesById((prev) => ({
                ...prev,
                [activeConversation.id]: messages,
              }));
            }}
            matches={onboarding.matches}
            identityLabel={identityLabel}
            autoKickoffMessage={needsKickoff ? onboarding.kickoffMessage : null}
            onKickoffSent={handleKickoffSent}
            sidebarToggle={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="md:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeftIcon data-icon="inline-start" />
                Chats
              </Button>
            }
          />
        </main>
      </div>
    </div>
  );
}
