"use client";

import type { ChatThread } from "./types";

type ChatSidebarProps = {
  threads: ChatThread[];
  activeId: string;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
};

function formatUpdatedAt(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(ts);
  } catch {
    return "";
  }
}

export function ChatSidebar({
  threads,
  activeId,
  open,
  onClose,
  onNewChat,
  onSelect,
}: ChatSidebarProps) {
  return (
    <>
      <div
        className={[
          "fixed inset-0 z-30 bg-ink/30 backdrop-blur-[2px] transition md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-[17.5rem] flex-col border-r border-line bg-mist transition-transform duration-300 md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-5 pb-3">
          <div>
            <p className="font-display text-lg font-semibold tracking-tight text-ink">
              Gravy Scout
            </p>
            <p className="font-mono text-[10px] tracking-[0.18em] text-ink-muted uppercase">
              Sessions
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink md:hidden"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onNewChat}
            className="w-full rounded-xl bg-ink px-3 py-2.5 text-sm font-semibold text-paper transition hover:bg-ink-muted"
          >
            New chat
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {threads.length === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-muted">
              No chats yet. Start one from the composer.
            </p>
          ) : (
            threads.map((thread) => {
              const active = thread.id === activeId;
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => onSelect(thread.id)}
                  className={[
                    "w-full rounded-xl px-3 py-2.5 text-left transition",
                    active
                      ? "bg-surface shadow-[0_8px_24px_-18px_rgba(14,24,20,0.55)] ring-1 ring-line-strong"
                      : "hover:bg-surface/70",
                  ].join(" ")}
                >
                  <span className="line-clamp-2 text-sm font-medium text-ink">
                    {thread.title}
                  </span>
                  <span className="mt-1 block font-mono text-[10px] tracking-wide text-ink-muted uppercase">
                    {formatUpdatedAt(thread.updatedAt)}
                  </span>
                </button>
              );
            })
          )}
        </nav>
      </aside>
    </>
  );
}
