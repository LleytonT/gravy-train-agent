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
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HandleMessageStreamEvent, SessionState } from "eve/client";

import { ChatPanel } from "./chat-panel";
import { ChatSidebar } from "./chat-sidebar";
import {
  createThread,
  loadActiveThreadId,
  loadThreads,
  saveActiveThreadId,
  saveThreads,
  titleFromPrompt,
} from "./thread-storage";
import type { ChatThread } from "./types";

export function ChatShell() {
  const [hydrated, setHydrated] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingState>({
    completed: false,
  });
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setOnboarding(loadOnboardingState());

    const existing = loadThreads();
    if (existing.length === 0) {
      const first = createThread();
      setThreads([first]);
      setActiveId(first.id);
      saveThreads([first]);
      saveActiveThreadId(first.id);
    } else {
      setThreads(existing);
      const savedActive = loadActiveThreadId();
      const nextActive =
        existing.find((thread) => thread.id === savedActive)?.id ?? existing[0].id;
      setActiveId(nextActive);
      saveActiveThreadId(nextActive);
    }
    setHydrated(true);
  }, []);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeId) ?? threads[0],
    [threads, activeId],
  );

  const updateThreads = useCallback((updater: (prev: ChatThread[]) => ChatThread[]) => {
    setThreads((prev) => {
      const next = updater(prev);
      saveThreads(next);
      return next;
    });
  }, []);

  const handleOnboardingComplete = useCallback(
    (result: {
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

      // Fresh thread titled for the advisor kickoff
      const thread = createThread(
        `${result.identity.currentTitle ?? "Role"} → gravy train`,
      );
      updateThreads((prev) => [thread, ...prev]);
      setActiveId(thread.id);
      saveActiveThreadId(thread.id);
    },
    [updateThreads],
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

  const handleNewChat = useCallback(() => {
    const thread = createThread();
    updateThreads((prev) => [thread, ...prev]);
    setActiveId(thread.id);
    saveActiveThreadId(thread.id);
    setSidebarOpen(false);
  }, [updateThreads]);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    saveActiveThreadId(id);
    setSidebarOpen(false);
  }, []);

  const handlePersist = useCallback(
    (snapshot: {
      events: readonly HandleMessageStreamEvent[];
      session?: SessionState;
    }) => {
      updateThreads((prev) =>
        prev.map((thread) =>
          thread.id === activeId
            ? {
                ...thread,
                updatedAt: Date.now(),
                events: [...snapshot.events],
                session: snapshot.session,
              }
            : thread,
        ),
      );
    },
    [activeId, updateThreads],
  );

  const handleTitleSeed = useCallback(
    (prompt: string) => {
      updateThreads((prev) =>
        prev.map((thread) =>
          thread.id === activeId &&
          (thread.title === "New scout" || thread.title.includes("→ gravy"))
            ? { ...thread, title: titleFromPrompt(prompt), updatedAt: Date.now() }
            : thread,
        ),
      );
    },
    [activeId, updateThreads],
  );

  if (!hydrated) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-ink-muted">
        Loading scout
      </div>
    );
  }

  if (!onboarding.completed) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  if (!activeThread) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-ink-muted">
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
          threads={threads}
          activeId={activeThread.id}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNewChat={handleNewChat}
          onSelect={handleSelect}
          onRedoSetup={handleRedoSetup}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <ChatPanel
            key={activeThread.id}
            threadId={activeThread.id}
            initialEvents={activeThread.events ?? []}
            initialSession={activeThread.session}
            onPersist={handlePersist}
            onTitleSeed={handleTitleSeed}
            matches={onboarding.matches}
            identityLabel={identityLabel}
            autoKickoffMessage={needsKickoff ? onboarding.kickoffMessage : null}
            onKickoffSent={handleKickoffSent}
            sidebarToggle={
              <button
                type="button"
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink md:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                Chats
              </button>
            }
          />
        </main>
      </div>
    </div>
  );
}
