"use client";

import { useEffect, useRef, useState } from "react";

type ChatComposerProps = {
  disabled?: boolean;
  busy?: boolean;
  onSend: (message: string) => void;
  onStop?: () => void;
};

export function ChatComposer({ disabled, busy, onSend, onStop }: ChatComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  function submit() {
    const message = value.trim();
    if (!message || disabled || busy) return;
    onSend(message);
    setValue("");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-2 md:px-6">
      <form
        className="relative overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[0_18px_50px_-28px_rgba(14,24,20,0.35)] transition-[box-shadow,border-color] duration-300 focus-within:border-signal focus-within:shadow-[0_22px_55px_-24px_rgba(12,122,82,0.28)]"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={textareaRef}
          name="message"
          rows={1}
          value={value}
          disabled={disabled}
          placeholder="Ask about a company, score, or watchlist"
          className="block w-full resize-none bg-transparent px-4 pb-12 pt-3.5 text-[15px] leading-6 text-ink outline-none placeholder:text-ink-muted disabled:opacity-60"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-3 pb-2.5">
          <p className="pl-1 font-mono text-[11px] tracking-wide text-ink-muted uppercase">
            Enter to send · Shift+Enter for line
          </p>
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="rounded-xl bg-ink px-3.5 py-2 text-sm font-medium text-paper transition hover:bg-ink-muted"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || value.trim().length === 0}
              className="rounded-xl bg-signal px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-signal-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
