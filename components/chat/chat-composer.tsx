"use client";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import type { ChatStatus } from "ai";

type ChatComposerProps = {
  disabled?: boolean;
  busy?: boolean;
  status?: ChatStatus;
  onSend: (message: string) => void;
  onStop?: () => void;
};

export function ChatComposer({
  disabled,
  busy,
  status,
  onSend,
  onStop,
}: ChatComposerProps) {
  const chatStatus: ChatStatus | undefined = busy
    ? status ?? "streaming"
    : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-2 md:px-6">
      <PromptInput
        className="rounded-xl border-border bg-card shadow-sm transition-[box-shadow,border-color] duration-300 focus-within:border-ring focus-within:shadow-md"
        onSubmit={(message) => {
          const text = message.text.trim();
          if (!text || disabled || busy) return;
          onSend(text);
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            disabled={disabled}
            placeholder="Ask about a company, score, or watchlist"
            className="min-h-12 text-[15px] leading-6"
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <p className="px-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              Enter to send · Shift+Enter for line
            </p>
          </PromptInputTools>
          <PromptInputSubmit
            disabled={disabled && !busy}
            status={chatStatus}
            onStop={onStop}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
