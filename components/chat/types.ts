import type { SessionState } from "eve/client";

export type ChatConversation = {
  id: string;
  title: string;
  updatedAt: number;
  status?: string;
};

export type DurableChatMessage = {
  id: string;
  conversationId?: string;
  role: "member" | "assistant" | "system";
  surface: "web" | "telegram" | "system";
  body: string;
  createdAt: string;
  idempotencyKey?: string;
};

export type ConversationEveSession = SessionState;

/** @deprecated Use ChatConversation — kept as alias during GS-004 UI migration. */
export type ChatThread = ChatConversation;

export const SUGGESTIONS = [
  "What roles fit me as an SE at Vercel?",
  "Who should I talk to at Decagon?",
  "Score Fireworks for my profile",
  "What's on my watchlist?",
] as const;
