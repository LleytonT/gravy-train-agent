"use client";

import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EveMessage, EveMessagePart } from "eve/react";
import { ExternalLinkIcon } from "lucide-react";

function toolLabel(toolName: string): string {
  return toolName.replace(/_/g, " ");
}

function ToolPart({ part }: { part: Extract<EveMessagePart, { type: "dynamic-tool" }> }) {
  const pending =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested" ||
    part.state === "approval-responded";
  const failed = part.state === "output-error" || part.state === "output-denied";

  return (
    <div
      className={cn(
        "animate-fade-in flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]",
        failed
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-border bg-muted text-foreground",
      )}
    >
      <span
        className={cn(
          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
          pending
            ? "animate-pulse-dot bg-primary"
            : failed
              ? "bg-destructive"
              : "bg-primary",
        )}
      />
      <div className="min-w-0">
        <Badge variant="secondary" className="mb-1 font-mono text-[10px] uppercase">
          {pending ? "Working" : failed ? "Failed" : "Done"}
        </Badge>
        <p className="truncate font-medium">{toolLabel(part.toolName)}</p>
        {part.state === "output-error" && part.errorText ? (
          <p className="mt-1 text-[12px] text-destructive">{part.errorText}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MessageBubble({ message }: { message: EveMessage }) {
  const isUser = message.role === "user";
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
        <div className="space-y-2.5">
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              const streaming = part.state === "streaming";
              if (!part.text && !streaming) return null;
              return (
                <MessageResponse
                  key={`${message.id}-text-${index}`}
                  className={cn(
                    "markdown-body",
                    isUser &&
                      "[&_*]:text-background [&_a]:text-background [&_code]:bg-background/15 [&_strong]:text-background",
                  )}
                  isAnimating={streaming}
                >
                  {part.text}
                </MessageResponse>
              );
            }
            if (part.type === "reasoning") {
              return (
                <p
                  key={`${message.id}-reason-${index}`}
                  className="text-[13px] italic leading-6 text-muted-foreground"
                >
                  {part.text}
                </p>
              );
            }
            if (part.type === "dynamic-tool") {
              return <ToolPart key={`${message.id}-tool-${index}`} part={part} />;
            }
            if (part.type === "authorization") {
              return (
                <div
                  key={`${message.id}-auth-${index}`}
                  className="rounded-lg border border-border bg-muted px-3 py-2 text-sm"
                >
                  <p className="font-medium">{part.displayName}</p>
                  <p className="mt-1 text-muted-foreground">{part.description}</p>
                  {part.state === "required" && part.authorization?.url ? (
                    <Button asChild variant="link" className="mt-1 h-auto px-0" size="sm">
                      <a
                        href={part.authorization.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Sign in
                        <ExternalLinkIcon data-icon="inline-end" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              );
            }
            return null;
          })}
        </div>
      </MessageContent>
    </Message>
  );
}
