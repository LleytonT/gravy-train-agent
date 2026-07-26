import type { HandleMessageStreamEvent, SessionState } from "eve/client";

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: number;
  events?: HandleMessageStreamEvent[];
  session?: SessionState;
};

export const SUGGESTIONS = [
  "Why is Fireworks interesting?",
  "Score Modal for me",
  "What's on my watchlist?",
  "Add Sierra to the watchlist",
] as const;
