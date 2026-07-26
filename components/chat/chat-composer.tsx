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
        className="relative overflow-hidden rounded-2xl border border-[var(--color-line-strong)] bg-white/80 shadow-[0_18px_50px_-28px_rgba(20,32,28,0.45)] backdrop-blur-md transition-[box-shadow,border-color] duration-300 focus-within:border-[var(--color-signal)] focus-within:shadow-[0_22px_55px_-24px_rgba(15,143,95,0.35)]"
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
          placeholder="Ask about a company, score, or watchlist…"
          className="block w-full resize-none bg-transparent px-4 pb-12 pt-3.5 text-[15px] leading-6 text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-soft)]/55 disabled:opacity-60"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-3 pb-2.5">
          <p className="pl-1 font-mono text-[11px] tracking-wide text-[var(--color-ink-soft)]/55 uppercase">
            Enter to send · Shift+Enter for line
          </p>
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="rounded-xl bg-[var(--color-ink)] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-ink-soft)]"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || value.trim().length === 0}
              className="rounded-xl bg-[var(--color-signal)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-signal-deep)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
