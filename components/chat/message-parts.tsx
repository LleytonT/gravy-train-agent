"use client";

import type { EveMessage, EveMessagePart } from "eve/react";

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
      className={[
        "animate-fade-in flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]",
        failed
          ? "border-warn bg-warn-soft text-warn"
          : "border-line bg-mist text-ink",
      ].join(" ")}
    >
      <span
        className={[
          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
          pending
            ? "animate-pulse-dot bg-signal"
            : failed
              ? "bg-warn"
              : "bg-signal-deep",
        ].join(" ")}
      />
      <div className="min-w-0">
        <p className="font-mono text-[12px] tracking-wide text-ink-muted uppercase">
          {pending ? "Working" : failed ? "Failed" : "Done"}
        </p>
        <p className="truncate font-medium text-ink">{toolLabel(part.toolName)}</p>
        {part.state === "output-error" && part.errorText ? (
          <p className="mt-1 text-[12px] text-warn">{part.errorText}</p>
        ) : null}
      </div>
    </div>
  );
}

function TextBlock({ text, streaming }: { text: string; streaming?: boolean }) {
  if (!text && !streaming) return null;
  return (
    <div className="whitespace-pre-wrap text-[15px] leading-7 text-ink">
      {text}
      {streaming ? (
        <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[2px] animate-pulse-dot bg-signal" />
      ) : null}
    </div>
  );
}

export function MessageBubble({ message }: { message: EveMessage }) {
  const isUser = message.role === "user";

  return (
    <article
      className={[
        "animate-rise mx-auto w-full max-w-3xl px-4 md:px-6",
        isUser ? "flex justify-end" : "",
      ].join(" ")}
    >
      <div
        className={[
          "min-w-0",
          isUser
            ? "max-w-[min(100%,36rem)] rounded-2xl bg-ink px-4 py-3 text-paper shadow-[0_10px_30px_-18px_rgba(14,24,20,0.55)]"
            : "w-full",
        ].join(" ")}
      >
        {!isUser ? (
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-signal font-display text-[11px] font-bold text-white">
              G
            </span>
            <span className="font-display text-sm font-semibold tracking-tight text-ink">
              Gravy Scout
            </span>
          </div>
        ) : null}

        <div className="space-y-2.5">
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              return (
                <TextBlock
                  key={`${message.id}-text-${index}`}
                  text={part.text}
                  streaming={part.state === "streaming"}
                />
              );
            }
            if (part.type === "reasoning") {
              return (
                <p
                  key={`${message.id}-reason-${index}`}
                  className="text-[13px] italic leading-6 text-ink-muted"
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
                  className="rounded-md border border-line bg-mist px-3 py-2 text-sm text-ink"
                >
                  <p className="font-medium">{part.displayName}</p>
                  <p className="mt-1 text-ink-muted">{part.description}</p>
                  {part.state === "required" && part.authorization?.url ? (
                    <a
                      className="mt-2 inline-block text-signal-deep underline underline-offset-2"
                      href={part.authorization.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Sign in
                    </a>
                  ) : null}
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    </article>
  );
}
