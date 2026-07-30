import type { HandleMessageStreamEvent, SessionState } from "eve/client";

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: number;
  events?: HandleMessageStreamEvent[];
  session?: SessionState;
};

export const SUGGESTIONS = [
  "What roles fit me as an SE at Vercel?",
  "Who should I talk to at Decagon?",
  "Score Fireworks for my profile",
  "What's on my watchlist?",
] as const;
