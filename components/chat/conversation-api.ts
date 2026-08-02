import type { SessionState } from "eve/client";

import type { ChatConversation, DurableChatMessage } from "./types";

export class ConversationApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ConversationApiError";
    this.status = status;
  }
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await parseJson(response);
  if (!response.ok) {
    const message =
      json &&
      typeof json === "object" &&
      "error" in json &&
      typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Request failed (${response.status})`;
    throw new ConversationApiError(message, response.status);
  }
  return json as T;
}

function toConversation(row: {
  id: string;
  title: string;
  updatedAt: string | Date;
  status?: string;
}): ChatConversation {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    updatedAt: new Date(row.updatedAt).getTime(),
  };
}

function toMessage(row: {
  id: string;
  conversationId?: string;
  role: DurableChatMessage["role"];
  surface: DurableChatMessage["surface"];
  body: string;
  createdAt: string | Date;
  idempotencyKey?: string;
}): DurableChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    surface: row.surface,
    body: row.body,
    createdAt: new Date(row.createdAt).toISOString(),
    idempotencyKey: row.idempotencyKey,
  };
}

export async function fetchConversations(): Promise<ChatConversation[]> {
  const data = await request<{
    conversations: Array<{
      id: string;
      title: string;
      updatedAt: string;
      status?: string;
    }>;
  }>("/api/conversations");
  return data.conversations.map(toConversation);
}

export async function createConversation(
  title?: string,
): Promise<ChatConversation> {
  const data = await request<{
    conversation: {
      id: string;
      title: string;
      updatedAt: string;
      status?: string;
    };
  }>("/api/conversations", {
    method: "POST",
    body: JSON.stringify(title ? { title } : {}),
  });
  return toConversation(data.conversation);
}

export async function fetchMessages(
  conversationId: string,
): Promise<DurableChatMessage[]> {
  const data = await request<{
    messages: Array<{
      id: string;
      conversationId?: string;
      role: DurableChatMessage["role"];
      surface: DurableChatMessage["surface"];
      body: string;
      createdAt: string;
      idempotencyKey?: string;
    }>;
  }>(
    `/api/conversations/${conversationId}/messages?direction=backward&limit=80`,
  );
  return data.messages.map(toMessage);
}

export async function fetchEveSession(
  conversationId: string,
): Promise<SessionState | undefined> {
  const data = await request<{
    eveSession: {
      sessionId: string;
      continuationToken?: string | null;
      streamIndex: number;
    } | null;
  }>(`/api/conversations/${conversationId}/session?surface=web`);

  if (!data.eveSession) return undefined;
  return {
    sessionId: data.eveSession.sessionId,
    continuationToken: data.eveSession.continuationToken ?? undefined,
    streamIndex: data.eveSession.streamIndex,
  };
}

export type BeginTurnResult = {
  created: boolean;
  conversation: ChatConversation;
  message: DurableChatMessage;
  eveSession?: SessionState;
  contextPrefix: string | null;
  shouldInjectContext: boolean;
};

export async function beginTurn(
  conversationId: string,
  input: {
    body: string;
    idempotencyKey: string;
    titleFromBody?: boolean;
  },
): Promise<BeginTurnResult> {
  const data = await request<{
    created: boolean;
    conversation: {
      id: string;
      title: string;
      updatedAt: string;
    };
    message: {
      id: string;
      role: DurableChatMessage["role"];
      surface: DurableChatMessage["surface"];
      body: string;
      createdAt: string;
      idempotencyKey: string;
    };
    eveSession: {
      sessionId: string;
      continuationToken?: string | null;
      streamIndex: number;
    } | null;
    contextPrefix: string | null;
    shouldInjectContext: boolean;
  }>(`/api/conversations/${conversationId}/turns`, {
    method: "POST",
    body: JSON.stringify({
      action: "begin",
      surface: "web",
      body: input.body,
      idempotencyKey: input.idempotencyKey,
      titleFromBody: input.titleFromBody,
    }),
  });

  return {
    created: data.created,
    conversation: toConversation(data.conversation),
    message: toMessage({
      ...data.message,
      conversationId,
    }),
    eveSession: data.eveSession
      ? {
          sessionId: data.eveSession.sessionId,
          continuationToken: data.eveSession.continuationToken ?? undefined,
          streamIndex: data.eveSession.streamIndex,
        }
      : undefined,
    contextPrefix: data.contextPrefix,
    shouldInjectContext: data.shouldInjectContext,
  };
}

export async function completeTurn(
  conversationId: string,
  input: {
    assistantBody: string;
    assistantIdempotencyKey: string;
    eveSessionId: string;
    continuationToken?: string;
    streamIndex?: number;
  },
): Promise<DurableChatMessage> {
  const data = await request<{
    assistantMessage: {
      id: string;
      role: DurableChatMessage["role"];
      surface: DurableChatMessage["surface"];
      body: string;
      createdAt: string;
      idempotencyKey: string;
    };
  }>(`/api/conversations/${conversationId}/turns`, {
    method: "POST",
    body: JSON.stringify({
      action: "complete",
      surface: "web",
      assistantBody: input.assistantBody,
      assistantIdempotencyKey: input.assistantIdempotencyKey,
      eveSessionId: input.eveSessionId,
      continuationToken: input.continuationToken,
      streamIndex: input.streamIndex,
    }),
  });
  return toMessage({
    ...data.assistantMessage,
    conversationId,
  });
}

export async function syncTurnSession(
  conversationId: string,
  input: {
    eveSessionId: string;
    continuationToken?: string;
    streamIndex?: number;
  },
): Promise<void> {
  await request(`/api/conversations/${conversationId}/turns`, {
    method: "POST",
    body: JSON.stringify({
      action: "sync",
      surface: "web",
      eveSessionId: input.eveSessionId,
      continuationToken: input.continuationToken,
      streamIndex: input.streamIndex,
    }),
  });
}

const ACTIVE_KEY = "gravy-scout.active-conversation.v1";

export function loadActiveConversationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveConversationId(id: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // ignore quota / private mode
  }
}

/** Clear legacy browser thread storage from pre-GS-004 clients. */
export function clearLegacyThreadStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("gravy-scout.threads.v1");
    localStorage.removeItem("gravy-scout.active-thread.v1");
  } catch {
    // ignore
  }
}

export function extractAssistantText(
  messages: ReadonlyArray<{
    role: string;
    parts: ReadonlyArray<{ type: string; text?: string }>;
  }>,
): string {
  const assistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (!assistant) return "";
  return assistant.parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}
