"use client";

import { SUGGESTIONS } from "./types";

type ChatEmptyProps = {
  onSuggestion: (prompt: string) => void;
  disabled?: boolean;
};

export function ChatEmpty({ onSuggestion, disabled }: ChatEmptyProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-10 md:px-6">
      <div className="animate-rise">
        <p className="font-mono text-[11px] tracking-[0.22em] text-[var(--color-signal-deep)] uppercase">
          APAC GTM scout
        </p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] font-semibold tracking-tight text-[var(--color-ink)] md:text-6xl">
          Gravy Scout
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[var(--color-ink-soft)] text-balance">
          Connect your LinkedIn role, get gravy-train seats that match, and the
          right people to reach out to.
        </p>
      </div>

      <div
        className="animate-rise mt-10 grid gap-2 sm:grid-cols-2"
        style={{ animationDelay: "90ms" }}
      >
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => onSuggestion(suggestion)}
            className="group rounded-xl border border-[var(--color-line)] bg-white/55 px-4 py-3.5 text-left text-sm leading-6 text-[var(--color-ink)] transition duration-300 hover:-translate-y-0.5 hover:border-[var(--color-signal)] hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="block font-medium transition group-hover:text-[var(--color-signal-deep)]">
              {suggestion}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
