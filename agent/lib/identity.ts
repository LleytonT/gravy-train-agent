/**
 * Identity module — resolves verified external principals to internal members.
 *
 * Only this module should know provider subject IDs (Clerk `user_*`, Telegram
 * user IDs, local-dev). Feature modules and Eve tools accept only the internal
 * `memberId`. Channel-link tokens are created and consumed here.
 */

import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";
import type { SessionAuthContext, SessionContext } from "eve/context";

import { getDb } from "./db/client.js";
import {
  channelIdentities,
  channelLinkTokens,
  members,
  type ChannelIdentity,
} from "./db/schema.js";

export const LOCAL_DEV_EXTERNAL_AUTH_ID = "local-dev";

const DEFAULT_LINK_TOKEN_TTL_SECONDS = 15 * 60;
/** Telegram deep-link start payloads are capped at 64 characters. */
const LINK_TOKEN_BYTES = 24;

export type ExternalAuthPrincipal = {
  externalAuthId: string;
  email?: string | null;
  displayName?: string | null;
};

export type MemberRecord = {
  id: string;
  externalAuthId: string | null;
  email: string | null;
  displayName: string | null;
};

export type ChannelIdentityRecord = {
  id: string;
  memberId: string;
  provider: "telegram";
  externalUserId: string;
  username: string | null;
  linkedAt: Date;
  revokedAt: Date | null;
};

export type TelegramLinkToken = {
  token: string;
  deepLink: string | null;
  expiresAt: Date;
  botUsername: string | null;
};

export type ChannelLinkErrorCode =
  | "malformed"
  | "not_found"
  | "expired"
  | "used"
  | "conflict"
  | "not_linked"
  | "misconfigured";

export class ChannelLinkError extends Error {
  readonly code: ChannelLinkErrorCode;
  readonly status: number;

  constructor(code: ChannelLinkErrorCode, message: string, status = 400) {
    super(message);
    this.name = "ChannelLinkError";
    this.code = code;
    this.status = status;
  }
}

function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hashLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function linkTokenTtlSeconds(): number {
  const raw = process.env.TELEGRAM_LINK_TOKEN_TTL_SECONDS?.trim();
  if (!raw) return DEFAULT_LINK_TOKEN_TTL_SECONDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 60 || parsed > 24 * 60 * 60) {
    return DEFAULT_LINK_TOKEN_TTL_SECONDS;
  }
  return Math.floor(parsed);
}

function telegramBotUsername(): string | null {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();
  return username || null;
}

function toChannelIdentityRecord(row: ChannelIdentity): ChannelIdentityRecord {
  return {
    id: row.id,
    memberId: row.memberId,
    provider: "telegram",
    externalUserId: row.externalUserId,
    username: row.username,
    linkedAt: row.linkedAt,
    revokedAt: row.revokedAt,
  };
}

export async function findMemberByExternalAuthId(
  externalAuthId: string,
): Promise<MemberRecord | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: members.id,
      externalAuthId: members.externalAuthId,
      email: members.email,
      displayName: members.displayName,
    })
    .from(members)
    .where(eq(members.externalAuthId, externalAuthId))
    .limit(1);
  return row ?? null;
}

/**
 * Upsert a member row for a verified external auth subject.
 * Never accepts a client-supplied member ID — only the provider subject.
 */
export async function upsertMemberFromExternalAuth(
  principal: ExternalAuthPrincipal,
): Promise<MemberRecord> {
  const externalAuthId = principal.externalAuthId.trim();
  if (!externalAuthId) {
    throw new Error("externalAuthId is required");
  }

  const email = normalizeOptional(principal.email);
  const displayName = normalizeOptional(principal.displayName);
  const db = getDb();
  const existing = await findMemberByExternalAuthId(externalAuthId);

  if (existing) {
    const nextEmail = email ?? existing.email;
    const nextDisplayName = displayName ?? existing.displayName;
    if (nextEmail === existing.email && nextDisplayName === existing.displayName) {
      return existing;
    }

    const [updated] = await db
      .update(members)
      .set({
        email: nextEmail,
        displayName: nextDisplayName,
        updatedAt: new Date(),
      })
      .where(eq(members.id, existing.id))
      .returning({
        id: members.id,
        externalAuthId: members.externalAuthId,
        email: members.email,
        displayName: members.displayName,
      });
    return updated!;
  }

  const [created] = await db
    .insert(members)
    .values({
      externalAuthId,
      email,
      displayName,
    })
    .returning({
      id: members.id,
      externalAuthId: members.externalAuthId,
      email: members.email,
      displayName: members.displayName,
    });
  return created!;
}

export function memberIdFromSessionAuth(
  auth: SessionAuthContext | null | undefined,
): string | null {
  const value = auth?.attributes?.memberId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Resolve the verified internal member for the active Eve turn.
 * Ignores any client-supplied member IDs in tool arguments.
 */
export function requireMemberCaller(ctx: SessionContext): {
  memberId: string;
  principalId: string;
} {
  const caller = ctx.session.auth.current;
  const memberId = memberIdFromSessionAuth(caller);

  if (caller?.principalType !== "user" || !memberId) {
    throw new Error(
      "An authenticated member is required. Sign in on the web app, or use local Eve development which maps to the local-dev member.",
    );
  }

  return { memberId, principalId: caller.principalId };
}

/** Look up the active (non-revoked) Telegram channel identity for a user ID. */
export async function findMemberByTelegramUserId(
  telegramUserId: string,
): Promise<MemberRecord | null> {
  const externalUserId = telegramUserId.trim();
  if (!externalUserId) return null;

  const db = getDb();
  const [row] = await db
    .select({
      id: members.id,
      externalAuthId: members.externalAuthId,
      email: members.email,
      displayName: members.displayName,
    })
    .from(channelIdentities)
    .innerJoin(members, eq(members.id, channelIdentities.memberId))
    .where(
      and(
        eq(channelIdentities.provider, "telegram"),
        eq(channelIdentities.externalUserId, externalUserId),
        isNull(channelIdentities.revokedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getTelegramIdentityForMember(
  memberId: string,
): Promise<ChannelIdentityRecord | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(channelIdentities)
    .where(
      and(
        eq(channelIdentities.memberId, memberId),
        eq(channelIdentities.provider, "telegram"),
        isNull(channelIdentities.revokedAt),
      ),
    )
    .orderBy(desc(channelIdentities.linkedAt))
    .limit(1);
  return row ? toChannelIdentityRecord(row) : null;
}

/**
 * Mint a cryptographically random, short-lived, single-use Telegram deep-link
 * token bound to the authenticated member. Only the hash is persisted.
 */
export async function createTelegramLinkToken(
  memberId: string,
): Promise<TelegramLinkToken> {
  if (!memberId.trim()) {
    throw new ChannelLinkError("malformed", "memberId is required");
  }

  const token = randomBytes(LINK_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashLinkToken(token);
  const expiresAt = new Date(Date.now() + linkTokenTtlSeconds() * 1000);
  const db = getDb();

  await db.insert(channelLinkTokens).values({
    memberId,
    provider: "telegram",
    tokenHash,
    expiresAt,
  });

  const botUsername = telegramBotUsername();
  const deepLink = botUsername
    ? `https://t.me/${botUsername}?start=${token}`
    : null;

  return { token, deepLink, expiresAt, botUsername };
}

/**
 * Consume a one-time link token from Telegram `/start <token>`.
 * Binds the verified Telegram user ID to the token's member and discards the token.
 */
export async function consumeTelegramLinkToken(input: {
  token: string;
  telegramUserId: string;
  username?: string | null;
}): Promise<ChannelIdentityRecord> {
  const token = input.token.trim();
  const telegramUserId = input.telegramUserId.trim();
  const username = normalizeOptional(input.username)?.replace(/^@/, "") ?? null;

  if (!token || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new ChannelLinkError(
      "malformed",
      "Telegram link token is malformed",
    );
  }
  if (!telegramUserId) {
    throw new ChannelLinkError(
      "malformed",
      "A verified Telegram user ID is required; username-only linking is rejected",
    );
  }

  const db = getDb();
  const tokenHash = hashLinkToken(token);
  const [row] = await db
    .select()
    .from(channelLinkTokens)
    .where(
      and(
        eq(channelLinkTokens.tokenHash, tokenHash),
        eq(channelLinkTokens.provider, "telegram"),
      ),
    )
    .limit(1);

  if (!row) {
    throw new ChannelLinkError("not_found", "Telegram link token was not found");
  }
  if (row.consumedAt) {
    throw new ChannelLinkError(
      "used",
      "Telegram link token has already been used",
    );
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new ChannelLinkError("expired", "Telegram link token has expired");
  }

  const now = new Date();
  const [consumed] = await db
    .update(channelLinkTokens)
    .set({
      consumedAt: now,
      consumedByExternalUserId: telegramUserId,
    })
    .where(
      and(
        eq(channelLinkTokens.id, row.id),
        isNull(channelLinkTokens.consumedAt),
      ),
    )
    .returning();

  if (!consumed) {
    throw new ChannelLinkError(
      "used",
      "Telegram link token has already been used",
    );
  }

  // Refuse silent reassignment of an active Telegram identity to another member.
  const [existingForTelegram] = await db
    .select()
    .from(channelIdentities)
    .where(
      and(
        eq(channelIdentities.provider, "telegram"),
        eq(channelIdentities.externalUserId, telegramUserId),
      ),
    )
    .limit(1);

  if (
    existingForTelegram &&
    !existingForTelegram.revokedAt &&
    existingForTelegram.memberId !== row.memberId
  ) {
    throw new ChannelLinkError(
      "conflict",
      "This Telegram account is already linked to another member",
      409,
    );
  }

  // One Telegram identity per member: revoke any prior distinct link.
  const priorForMember = await db
    .select()
    .from(channelIdentities)
    .where(
      and(
        eq(channelIdentities.memberId, row.memberId),
        eq(channelIdentities.provider, "telegram"),
        isNull(channelIdentities.revokedAt),
      ),
    );
  for (const prior of priorForMember) {
    if (prior.externalUserId === telegramUserId) continue;
    await db
      .update(channelIdentities)
      .set({ revokedAt: now, updatedAt: now })
      .where(eq(channelIdentities.id, prior.id));
  }

  if (existingForTelegram) {
    const [updated] = await db
      .update(channelIdentities)
      .set({
        memberId: row.memberId,
        username,
        linkedAt: now,
        revokedAt: null,
        updatedAt: now,
      })
      .where(eq(channelIdentities.id, existingForTelegram.id))
      .returning();
    return toChannelIdentityRecord(updated!);
  }

  const [created] = await db
    .insert(channelIdentities)
    .values({
      memberId: row.memberId,
      provider: "telegram",
      externalUserId: telegramUserId,
      username,
      linkedAt: now,
    })
    .returning();
  return toChannelIdentityRecord(created!);
}

/**
 * Refresh display username for an already-linked Telegram user.
 * Identity remains the Telegram user ID — username changes never break the link.
 */
export async function touchTelegramIdentityUsername(
  telegramUserId: string,
  username: string | null | undefined,
): Promise<void> {
  const externalUserId = telegramUserId.trim();
  const nextUsername = normalizeOptional(username)?.replace(/^@/, "") ?? null;
  if (!externalUserId) return;

  const db = getDb();
  const [row] = await db
    .select()
    .from(channelIdentities)
    .where(
      and(
        eq(channelIdentities.provider, "telegram"),
        eq(channelIdentities.externalUserId, externalUserId),
        isNull(channelIdentities.revokedAt),
      ),
    )
    .limit(1);
  if (!row || row.username === nextUsername) return;

  await db
    .update(channelIdentities)
    .set({ username: nextUsername, updatedAt: new Date() })
    .where(eq(channelIdentities.id, row.id));
}

/** Immediately revoke the member's active Telegram identity. */
export async function revokeTelegramIdentity(
  memberId: string,
): Promise<ChannelIdentityRecord | null> {
  const existing = await getTelegramIdentityForMember(memberId);
  if (!existing) {
    throw new ChannelLinkError(
      "not_linked",
      "No active Telegram identity to revoke",
      404,
    );
  }

  const db = getDb();
  const now = new Date();
  const [updated] = await db
    .update(channelIdentities)
    .set({ revokedAt: now, updatedAt: now })
    .where(eq(channelIdentities.id, existing.id))
    .returning();
  return updated ? toChannelIdentityRecord(updated) : null;
}

/** True when the member has an active (non-revoked) Telegram channel identity. */
export async function hasActiveTelegramIdentity(
  memberId: string,
): Promise<boolean> {
  const identity = await getTelegramIdentityForMember(memberId);
  return Boolean(identity);
}

export function telegramExternalAuthId(telegramUserId: string): string {
  return `telegram:${telegramUserId.trim()}`;
}

/**
 * Create or resolve a member from a verified Telegram Login Widget principal.
 * Binds (or refreshes) the Telegram channel identity in the same step so web
 * and Telegram share one member without a separate deep-link hop.
 */
export async function upsertMemberFromTelegramLogin(input: {
  telegramUserId: string;
  username?: string | null;
  displayName?: string | null;
}): Promise<MemberRecord> {
  const telegramUserId = input.telegramUserId.trim();
  if (!telegramUserId || !/^\d+$/.test(telegramUserId)) {
    throw new ChannelLinkError(
      "malformed",
      "A verified Telegram user ID is required",
    );
  }

  const username =
    normalizeOptional(input.username)?.replace(/^@/, "") ?? null;
  const displayName = normalizeOptional(input.displayName);
  const externalAuthId = telegramExternalAuthId(telegramUserId);

  const existingByTelegram = await findMemberByTelegramUserId(telegramUserId);
  const member =
    existingByTelegram ??
    (await upsertMemberFromExternalAuth({
      externalAuthId,
      displayName,
    }));

  // Keep external_auth_id stable for Telegram-origin members.
  if (!existingByTelegram && member.externalAuthId !== externalAuthId) {
    const db = getDb();
    await db
      .update(members)
      .set({
        externalAuthId,
        displayName: displayName ?? member.displayName,
        updatedAt: new Date(),
      })
      .where(eq(members.id, member.id));
  } else if (displayName && displayName !== member.displayName) {
    const db = getDb();
    await db
      .update(members)
      .set({ displayName, updatedAt: new Date() })
      .where(eq(members.id, member.id));
  }

  const db = getDb();
  const now = new Date();
  const [existingIdentity] = await db
    .select()
    .from(channelIdentities)
    .where(
      and(
        eq(channelIdentities.provider, "telegram"),
        eq(channelIdentities.externalUserId, telegramUserId),
      ),
    )
    .limit(1);

  if (
    existingIdentity &&
    !existingIdentity.revokedAt &&
    existingIdentity.memberId !== member.id
  ) {
    throw new ChannelLinkError(
      "conflict",
      "This Telegram account is already linked to another member",
      409,
    );
  }

  if (existingIdentity) {
    await db
      .update(channelIdentities)
      .set({
        memberId: member.id,
        username,
        linkedAt: existingIdentity.revokedAt ? now : existingIdentity.linkedAt,
        revokedAt: null,
        updatedAt: now,
      })
      .where(eq(channelIdentities.id, existingIdentity.id));
  } else {
    await db.insert(channelIdentities).values({
      memberId: member.id,
      provider: "telegram",
      externalUserId: telegramUserId,
      username,
      linkedAt: now,
    });
  }

  return (
    (await findMemberByExternalAuthId(externalAuthId)) ??
    (await findMemberByTelegramUserId(telegramUserId)) ??
    member
  );
}
