"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PlusIcon } from "lucide-react";

import type { ChatThread } from "./types";

type ChatSidebarProps = {
  threads: ChatThread[];
  activeId: string;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRedoSetup?: () => void;
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

function ThreadList({
  threads,
  activeId,
  onSelect,
}: {
  threads: ChatThread[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (threads.length === 0) {
    return (
      <p className="px-2 py-3 text-sm text-muted-foreground">
        No chats yet. Start one from the composer.
      </p>
    );
  }

  return (
    <nav className="space-y-1 px-1 pb-4">
      {threads.map((thread) => {
        const active = thread.id === activeId;
        return (
          <button
            key={thread.id}
            type="button"
            onClick={() => onSelect(thread.id)}
            className={cn(
              "w-full rounded-lg px-3 py-2.5 text-left transition",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm ring-1 ring-sidebar-border"
                : "hover:bg-sidebar-accent/60",
            )}
          >
            <span className="line-clamp-2 text-sm font-medium">{thread.title}</span>
            <span className="mt-1 block font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {formatUpdatedAt(thread.updatedAt)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function SidebarBody({
  threads,
  activeId,
  onNewChat,
  onSelect,
  onRedoSetup,
}: Omit<ChatSidebarProps, "open" | "onClose">) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pt-5 pb-3">
        <div>
          <p className="font-display text-lg font-semibold tracking-tight">
            Gravy Scout
          </p>
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Sessions
          </p>
        </div>
      </div>

      <div className="px-3 pb-3">
        <Button className="w-full" onClick={onNewChat}>
          <PlusIcon data-icon="inline-start" />
          New chat
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2">
        <ThreadList threads={threads} activeId={activeId} onSelect={onSelect} />
      </ScrollArea>

      {onRedoSetup ? (
        <>
          <Separator />
          <div className="px-3 py-3">
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={onRedoSetup}
            >
              Redo setup
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ChatSidebar({
  threads,
  activeId,
  open,
  onClose,
  onNewChat,
  onSelect,
  onRedoSetup,
}: ChatSidebarProps) {
  return (
    <>
      <aside className="hidden w-[17.5rem] shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <SidebarBody
          threads={threads}
          activeId={activeId}
          onNewChat={onNewChat}
          onSelect={onSelect}
          onRedoSetup={onRedoSetup}
        />
      </aside>

      <Sheet open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
        <SheetContent side="left" className="w-[17.5rem] bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="sr-only">
            <SheetTitle>Chats</SheetTitle>
          </SheetHeader>
          <SidebarBody
            threads={threads}
            activeId={activeId}
            onNewChat={() => {
              onNewChat();
              onClose();
            }}
            onSelect={(id) => {
              onSelect(id);
              onClose();
            }}
            onRedoSetup={
              onRedoSetup
                ? () => {
                    onRedoSetup();
                    onClose();
                  }
                : undefined
            }
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
