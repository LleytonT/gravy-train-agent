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
        <p className="font-mono text-[11px] tracking-[0.18em] text-signal-deep uppercase">
          APAC GTM scout
        </p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] font-semibold tracking-tight text-ink md:text-6xl">
          Gravy Scout
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-ink-muted text-balance">
          Ask about dossiers, scores, and watchlist memory. Same agent as the
          CLI.
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
            className="group rounded-xl border border-line bg-surface px-4 py-3.5 text-left text-sm leading-6 text-ink shadow-[0_1px_0_rgba(14,24,20,0.04)] transition duration-300 hover:-translate-y-0.5 hover:border-signal hover:shadow-[0_10px_24px_-18px_rgba(14,24,20,0.45)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="block font-medium group-hover:text-signal-deep">
              {suggestion}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
