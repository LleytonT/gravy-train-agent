"use client";

import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import type { DurableChatMessage } from "./types";

export function DurableMessageBubble({
  message,
}: {
  message: DurableChatMessage;
}) {
  const isUser = message.role === "member";
  const from = isUser ? "user" : "assistant";

  return (
    <Message
      from={from}
      className="animate-rise mx-auto w-full max-w-3xl px-4 md:px-6"
    >
      {!isUser ? (
        <div className="mb-1 flex items-center gap-2">
          <Avatar size="sm" className="size-6 rounded-md">
            <AvatarFallback className="rounded-md bg-primary font-display text-[11px] font-bold text-primary-foreground">
              G
            </AvatarFallback>
          </Avatar>
          <span className="font-display text-sm font-semibold tracking-tight">
            Gravy Scout
          </span>
          {message.surface !== "web" ? (
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              via {message.surface}
            </span>
          ) : null}
        </div>
      ) : null}

      <MessageContent
        className={cn(
          "w-full max-w-full text-[15px] leading-7",
          isUser
            ? "bg-foreground text-background group-[.is-user]:bg-foreground group-[.is-user]:text-background"
            : "max-w-none",
        )}
      >
        {message.role === "system" ? (
          <p className="text-[13px] italic text-muted-foreground">{message.body}</p>
        ) : (
          <MessageResponse
            className={cn(
              "markdown-body",
              isUser &&
                "[&_*]:text-background [&_a]:text-background [&_code]:bg-background/15 [&_strong]:text-background",
            )}
          >
            {message.body}
          </MessageResponse>
        )}
      </MessageContent>
    </Message>
  );
}
