import type { ChatThread } from "./types";

const STORAGE_KEY = "gravy-scout.threads.v1";
const ACTIVE_KEY = "gravy-scout.active-thread.v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadThreads(): ChatThread[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatThread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveThreads(threads: ChatThread[]) {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

export function loadActiveThreadId(): string | null {
  if (!canUseStorage()) return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function saveActiveThreadId(id: string) {
  if (!canUseStorage()) return;
  localStorage.setItem(ACTIVE_KEY, id);
}

export function createThread(title = "New scout"): ChatThread {
  return {
    id: crypto.randomUUID(),
    title,
    updatedAt: Date.now(),
  };
}

export function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 42) return cleaned;
  return `${cleaned.slice(0, 39)}…`;
}
