/**
 * Canonical conversation module (GS-004).
 *
 * Postgres owns the durable member timeline. Eve sessions remain surface-specific
 * runtime cursors associated through `agent_sessions`. Feature callers pass only
 * the verified internal `memberId` — never a client-supplied owner id.
 */

import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";

import { getDb } from "./db/client.js";
import {
  agentSessions,
  careerProfiles,
  conversations,
  feedbackEvents,
  messages,
  type AgentSession,
  type Conversation,
  type ConversationSurface,
  type Message,
  type MessageRole,
} from "./db/schema.js";

const DEFAULT_TITLE = "New scout";
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const CONTEXT_MESSAGE_LIMIT = 12;
const SUMMARY_BODY_LIMIT = 280;

export class ConversationNotFoundError extends Error {
  readonly status = 404;

  constructor(message = "Conversation not found") {
    super(message);
    this.name = "ConversationNotFoundError";
  }
}

export class ConversationAccessError extends Error {
  readonly status = 403;

  constructor(message = "Not allowed to access this conversation") {
    super(message);
    this.name = "ConversationAccessError";
  }
}

export type MessageCursor = {
  createdAt: string;
  id: string;
};

export type ConversationCursor = {
  updatedAt: string;
  id: string;
};

export type EveSessionCursor = {
  sessionId: string;
  continuationToken?: string;
  streamIndex: number;
};

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

function encodeCursor(parts: Record<string, string>): string {
  return Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}

function decodeCursor<T extends Record<string, string>>(
  raw: string | undefined,
): T | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as T;
  } catch {
    return null;
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function truncate(text: string, max = SUMMARY_BODY_LIMIT): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

async function requireOwnedConversation(
  memberId: string,
  conversationId: string,
): Promise<Conversation> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.memberId, memberId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new ConversationNotFoundError();
  }
  return row;
}

export async function createConversation(
  memberId: string,
  options?: { title?: string },
): Promise<Conversation> {
  const db = getDb();
  const title = options?.title?.trim() || DEFAULT_TITLE;
  const [created] = await db
    .insert(conversations)
    .values({
      memberId,
      title,
      status: "active",
    })
    .returning();
  return created!;
}

/**
 * Return the member's most recently updated active conversation, or create one.
 * Used by Telegram (and other surfaces) that share the canonical timeline.
 */
export async function getOrCreateActiveConversation(
  memberId: string,
  options?: { title?: string },
): Promise<Conversation> {
  const { conversations: existing } = await listConversations(memberId, {
    limit: 1,
  });
  const active = existing.find((row) => row.status === "active");
  if (active) return active;
  return createConversation(memberId, options);
}

export async function listConversations(
  memberId: string,
  options?: { cursor?: string; limit?: number },
): Promise<{
  conversations: Conversation[];
  nextCursor: string | null;
}> {
  const db = getDb();
  const limit = clampLimit(options?.limit);
  const cursor = decodeCursor<ConversationCursor>(options?.cursor);

  const conditions = [eq(conversations.memberId, memberId)];
  if (cursor?.updatedAt && cursor.id) {
    const cursorDate = new Date(cursor.updatedAt);
    conditions.push(
      or(
        lt(conversations.updatedAt, cursorDate),
        and(
          eq(conversations.updatedAt, cursorDate),
          lt(conversations.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.updatedAt), desc(conversations.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last
      ? encodeCursor({
          updatedAt: toIso(last.updatedAt),
          id: last.id,
        })
      : null;

  return { conversations: page, nextCursor };
}

export async function getConversation(
  memberId: string,
  conversationId: string,
): Promise<Conversation> {
  return requireOwnedConversation(memberId, conversationId);
}

export async function updateConversationTitle(
  memberId: string,
  conversationId: string,
  title: string,
): Promise<Conversation> {
  await requireOwnedConversation(memberId, conversationId);
  const db = getDb();
  const nextTitle = title.trim() || DEFAULT_TITLE;
  const [updated] = await db
    .update(conversations)
    .set({
      title: nextTitle,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.memberId, memberId),
      ),
    )
    .returning();
  return updated!;
}

export async function touchConversation(
  memberId: string,
  conversationId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.memberId, memberId),
      ),
    );
}

export type AppendMessageInput = {
  memberId: string;
  conversationId: string;
  role: MessageRole;
  surface: ConversationSurface;
  body: string;
  idempotencyKey: string;
  externalMessageId?: string | null;
};

export async function appendMessage(
  input: AppendMessageInput,
): Promise<{ message: Message; created: boolean }> {
  await requireOwnedConversation(input.memberId, input.conversationId);
  const db = getDb();
  const body = input.body.trim();
  if (!body) {
    throw new Error("Message body is required");
  }
  if (!input.idempotencyKey.trim()) {
    throw new Error("idempotencyKey is required");
  }

  const inserted = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      memberId: input.memberId,
      role: input.role,
      surface: input.surface,
      body,
      externalMessageId: input.externalMessageId ?? null,
      idempotencyKey: input.idempotencyKey.trim(),
    })
    .onConflictDoNothing({ target: messages.idempotencyKey })
    .returning();

  if (inserted[0]) {
    await touchConversation(input.memberId, input.conversationId);
    return { message: inserted[0], created: true };
  }

  const [existing] = await db
    .select()
    .from(messages)
    .where(eq(messages.idempotencyKey, input.idempotencyKey.trim()))
    .limit(1);

  if (
    !existing ||
    existing.memberId !== input.memberId ||
    existing.conversationId !== input.conversationId
  ) {
    throw new ConversationAccessError(
      "Idempotency key belongs to another conversation",
    );
  }

  return { message: existing, created: false };
}

export async function listMessages(
  memberId: string,
  conversationId: string,
  options?: {
    cursor?: string;
    limit?: number;
    /** oldest-first page for chat UI (default). */
    direction?: "forward" | "backward";
  },
): Promise<{ messages: Message[]; nextCursor: string | null }> {
  await requireOwnedConversation(memberId, conversationId);
  const db = getDb();
  const limit = clampLimit(options?.limit);
  const direction = options?.direction ?? "forward";
  const cursor = decodeCursor<MessageCursor>(options?.cursor);

  const conditions = [
    eq(messages.conversationId, conversationId),
    eq(messages.memberId, memberId),
  ];

  if (cursor?.createdAt && cursor.id) {
    const cursorDate = new Date(cursor.createdAt);
    if (direction === "forward") {
      conditions.push(
        or(
          gt(messages.createdAt, cursorDate),
          and(eq(messages.createdAt, cursorDate), gt(messages.id, cursor.id)),
        )!,
      );
    } else {
      conditions.push(
        or(
          lt(messages.createdAt, cursorDate),
          and(eq(messages.createdAt, cursorDate), lt(messages.id, cursor.id)),
        )!,
      );
    }
  }

  const order =
    direction === "forward"
      ? [asc(messages.createdAt), asc(messages.id)]
      : [desc(messages.createdAt), desc(messages.id)];

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(...order)
    .limit(limit + 1);

  const page =
    direction === "backward"
      ? rows.slice(0, limit).reverse()
      : rows.slice(0, limit);
  const edge = direction === "backward" ? page[0] : page[page.length - 1];
  const nextCursor =
    rows.length > limit && edge
      ? encodeCursor({
          createdAt: toIso(edge.createdAt),
          id: edge.id,
        })
      : null;

  return { messages: page, nextCursor };
}

export async function getAgentSession(
  memberId: string,
  conversationId: string,
  surface: ConversationSurface,
): Promise<AgentSession | null> {
  await requireOwnedConversation(memberId, conversationId);
  const db = getDb();
  const [row] = await db
    .select()
    .from(agentSessions)
    .where(
      and(
        eq(agentSessions.conversationId, conversationId),
        eq(agentSessions.memberId, memberId),
        eq(agentSessions.surface, surface),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type AssociateAgentSessionInput = {
  memberId: string;
  conversationId: string;
  surface: ConversationSurface;
  eveSessionId: string;
  continuationTokenRef?: string | null;
  lastEventIndex?: number;
  summary?: string | null;
};

/**
 * Upsert the single Eve session reference for a conversation surface.
 * Continuation tokens are replaced only when a newer cursor is supplied —
 * concurrent stale writes must not rewind an active token.
 */
export async function associateAgentSession(
  input: AssociateAgentSessionInput,
): Promise<AgentSession> {
  await requireOwnedConversation(input.memberId, input.conversationId);
  if (!input.eveSessionId.trim()) {
    throw new Error("eveSessionId is required");
  }

  const db = getDb();
  const existing = await getAgentSession(
    input.memberId,
    input.conversationId,
    input.surface,
  );
  const now = new Date();
  const nextIndex = Math.max(0, input.lastEventIndex ?? existing?.lastEventIndex ?? 0);

  if (existing) {
    const sameSession = existing.eveSessionId === input.eveSessionId.trim();
    const mergedIndex = sameSession
      ? Math.max(existing.lastEventIndex, nextIndex)
      : nextIndex;
    // Only accept a continuation token when the stream cursor advances or the
    // Eve session id changes — stale reconnects must not rewind the token.
    const acceptToken =
      input.continuationTokenRef !== undefined &&
      (!sameSession || nextIndex >= existing.lastEventIndex);
    const [updated] = await db
      .update(agentSessions)
      .set({
        eveSessionId: input.eveSessionId.trim(),
        continuationTokenRef: acceptToken
          ? input.continuationTokenRef
          : existing.continuationTokenRef,
        lastEventIndex: mergedIndex,
        summary:
          input.summary !== undefined ? input.summary : existing.summary,
        updatedAt: now,
      })
      .where(eq(agentSessions.id, existing.id))
      .returning();
    return updated!;
  }

  try {
    const [created] = await db
      .insert(agentSessions)
      .values({
        conversationId: input.conversationId,
        memberId: input.memberId,
        surface: input.surface,
        eveSessionId: input.eveSessionId.trim(),
        continuationTokenRef: input.continuationTokenRef ?? null,
        lastEventIndex: nextIndex,
        summary: input.summary ?? null,
      })
      .returning();
    return created!;
  } catch {
    // Concurrent first-associate on the same surface: retry as update.
    const raced = await getAgentSession(
      input.memberId,
      input.conversationId,
      input.surface,
    );
    if (!raced) throw new Error("Failed to associate agent session");
    return associateAgentSession(input);
  }
}

export function toEveSessionCursor(
  session: AgentSession | null | undefined,
): EveSessionCursor | null {
  if (!session) return null;
  return {
    sessionId: session.eveSessionId,
    continuationToken: session.continuationTokenRef ?? undefined,
    streamIndex: session.lastEventIndex,
  };
}

export type ContextProjection = {
  prefix: string;
  recentMessageCount: number;
  otherSurfaceSummaries: string[];
};

/**
 * Bounded context for starting or resuming a surface session after history
 * accumulated on another surface (or an empty Eve session).
 */
export async function projectContextForSurface(
  memberId: string,
  conversationId: string,
  surface: ConversationSurface,
): Promise<ContextProjection> {
  await requireOwnedConversation(memberId, conversationId);
  const db = getDb();

  const recent = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.memberId, memberId),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(CONTEXT_MESSAGE_LIMIT);

  const chronological = [...recent].reverse();
  const otherSessions = await db
    .select()
    .from(agentSessions)
    .where(
      and(
        eq(agentSessions.conversationId, conversationId),
        eq(agentSessions.memberId, memberId),
      ),
    );

  const otherSurfaceSummaries = otherSessions
    .filter((session) => session.surface !== surface && session.summary)
    .map(
      (session) =>
        `[${session.surface}] ${truncate(session.summary ?? "", 180)}`,
    );

  const lines = chronological.map((message) => {
    const who =
      message.role === "member"
        ? "Member"
        : message.role === "assistant"
          ? "Gravy Scout"
          : "System";
    return `${who} (${message.surface}): ${truncate(message.body, 400)}`;
  });

  const parts: string[] = [
    "Shared Gravy Scout conversation context (canonical timeline). Continue helpfully without asking the member to repeat prior facts.",
  ];
  if (otherSurfaceSummaries.length > 0) {
    parts.push(`Other surface summaries:\n${otherSurfaceSummaries.join("\n")}`);
  }
  if (lines.length > 0) {
    parts.push(`Recent messages:\n${lines.join("\n")}`);
  }

  return {
    prefix: parts.join("\n\n"),
    recentMessageCount: chronological.length,
    otherSurfaceSummaries,
  };
}

export type BeginSurfaceTurnInput = {
  memberId: string;
  conversationId: string;
  surface: ConversationSurface;
  body: string;
  idempotencyKey: string;
  externalMessageId?: string | null;
  /** Seed conversation title from the first member prompt when still default. */
  titleFromBody?: boolean;
};

export type BeginSurfaceTurnResult = {
  conversation: Conversation;
  message: Message;
  created: boolean;
  agentSession: AgentSession | null;
  eveSession: EveSessionCursor | null;
  /** Prepend to the Eve user turn when opening a new surface session. */
  contextPrefix: string | null;
  shouldInjectContext: boolean;
};

/**
 * Record an inbound member message and resolve the Eve surface session cursor.
 * Does not call Eve itself — the web client (or a channel adapter) starts or
 * resumes the surface session using the returned cursor, then finalizes.
 */
export async function beginSurfaceTurn(
  input: BeginSurfaceTurnInput,
): Promise<BeginSurfaceTurnResult> {
  const conversation = await requireOwnedConversation(
    input.memberId,
    input.conversationId,
  );

  const { message, created } = await appendMessage({
    memberId: input.memberId,
    conversationId: input.conversationId,
    role: "member",
    surface: input.surface,
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    externalMessageId: input.externalMessageId,
  });

  let nextConversation = conversation;
  if (
    input.titleFromBody !== false &&
    created &&
    (conversation.title === DEFAULT_TITLE ||
      conversation.title.includes("→ gravy"))
  ) {
    nextConversation = await updateConversationTitle(
      input.memberId,
      input.conversationId,
      truncate(input.body, 42),
    );
  }

  const agentSession = await getAgentSession(
    input.memberId,
    input.conversationId,
    input.surface,
  );
  const shouldInjectContext = !agentSession;
  const projection = shouldInjectContext
    ? await projectContextForSurface(
        input.memberId,
        input.conversationId,
        input.surface,
      )
    : null;

  return {
    conversation: nextConversation,
    message,
    created,
    agentSession,
    eveSession: toEveSessionCursor(agentSession),
    contextPrefix: projection?.prefix ?? null,
    shouldInjectContext,
  };
}

export type CompleteSurfaceTurnInput = {
  memberId: string;
  conversationId: string;
  surface: ConversationSurface;
  assistantBody: string;
  assistantIdempotencyKey: string;
  eveSessionId: string;
  continuationTokenRef?: string | null;
  lastEventIndex?: number;
};

export type CompleteSurfaceTurnResult = {
  assistantMessage: Message;
  created: boolean;
  agentSession: AgentSession;
};

/**
 * Persist the completed assistant message once and advance the surface Eve cursor.
 */
export async function completeSurfaceTurn(
  input: CompleteSurfaceTurnInput,
): Promise<CompleteSurfaceTurnResult> {
  const { message, created } = await appendMessage({
    memberId: input.memberId,
    conversationId: input.conversationId,
    role: "assistant",
    surface: input.surface,
    body: input.assistantBody,
    idempotencyKey: input.assistantIdempotencyKey,
  });

  const summary = truncate(
    `Latest: ${truncate(input.assistantBody, 200)}`,
    SUMMARY_BODY_LIMIT,
  );

  const agentSession = await associateAgentSession({
    memberId: input.memberId,
    conversationId: input.conversationId,
    surface: input.surface,
    eveSessionId: input.eveSessionId,
    continuationTokenRef: input.continuationTokenRef,
    lastEventIndex: input.lastEventIndex,
    summary,
  });

  return {
    assistantMessage: message,
    created,
    agentSession,
  };
}

/**
 * Sync Eve session cursor without appending a message (mid-stream / reconnect).
 */
export async function syncSurfaceSessionCursor(input: {
  memberId: string;
  conversationId: string;
  surface: ConversationSurface;
  eveSessionId: string;
  continuationTokenRef?: string | null;
  lastEventIndex?: number;
}): Promise<AgentSession> {
  return associateAgentSession({
    ...input,
    summary: undefined,
  });
}

/**
 * Prove a fresh conversation leaves career profile + feedback untouched.
 * Used by smoke tests; not a product API.
 */
export async function countMemberDurableState(memberId: string): Promise<{
  profiles: number;
  feedback: number;
}> {
  const db = getDb();
  const [profileCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(careerProfiles)
    .where(eq(careerProfiles.memberId, memberId));
  const [feedbackCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedbackEvents)
    .where(eq(feedbackEvents.memberId, memberId));
  return {
    profiles: profileCount?.count ?? 0,
    feedback: feedbackCount?.count ?? 0,
  };
}

export function titleFromPrompt(prompt: string): string {
  return truncate(prompt, 42);
}
