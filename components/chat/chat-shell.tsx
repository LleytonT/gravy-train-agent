"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HandleMessageStreamEvent, SessionState } from "eve/client";

import { SiteHeader } from "@/components/site-header";
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
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
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
          thread.id === activeId && thread.title === "New scout"
            ? { ...thread, title: titleFromPrompt(prompt), updatedAt: Date.now() }
            : thread,
        ),
      );
    },
    [activeId, updateThreads],
  );

  if (!hydrated || !activeThread) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-ink-muted">
        Loading scout
      </div>
    );
  }

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
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <ChatPanel
            key={activeThread.id}
            threadId={activeThread.id}
            initialEvents={activeThread.events ?? []}
            initialSession={activeThread.session}
            onPersist={handlePersist}
            onTitleSeed={handleTitleSeed}
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
