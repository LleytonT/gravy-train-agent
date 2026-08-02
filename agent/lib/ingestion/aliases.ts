/**
 * Member-specific inbound email aliases.
 *
 * Resend receives any local-part on the inbound domain; we mint a revocable
 * alias per member and map webhook recipients back to memberId.
 */

import { customAlphabet } from "nanoid";
import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "../db/client.js";
import { connections, inboundQuarantine, sourceItemReceipts, sourceItems } from "../db/schema.js";
import { INBOUND_EMAIL_PROVIDER } from "./types.js";

const mintLocalPart = customAlphabet(
  "abcdefghijklmnopqrstuvwxyz0123456789",
  16,
);

export type InboundAliasRecord = {
  connectionId: string;
  memberId: string;
  address: string;
  status: string;
  connectedAt: Date;
  revokedAt: Date | null;
  metadata: Record<string, unknown>;
};

export type InboundIngestionStatus = {
  alias: InboundAliasRecord | null;
  domainConfigured: boolean;
  domain: string | null;
  recentReceiptCount: number;
  recentQuarantineCount: number;
  lastReceivedAt: Date | null;
  lastQuarantineAt: Date | null;
  lastQuarantineReason: string | null;
};

function inboundDomain(env: NodeJS.ProcessEnv = process.env): string | null {
  const domain = env.RESEND_INBOUND_DOMAIN?.trim().toLowerCase();
  return domain || null;
}

export function normalizeEmailAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function buildInboundAddress(
  localPart: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const domain = inboundDomain(env);
  if (!domain) {
    throw new Error(
      "RESEND_INBOUND_DOMAIN is required to provision inbound aliases",
    );
  }
  return `${localPart.toLowerCase()}@${domain}`;
}

function rowToAlias(row: {
  id: string;
  memberId: string;
  externalAccountId: string | null;
  status: string;
  connectedAt: Date;
  revokedAt: Date | null;
  metadata: Record<string, unknown>;
}): InboundAliasRecord {
  if (!row.externalAccountId) {
    throw new Error("Inbound connection missing externalAccountId");
  }
  return {
    connectionId: row.id,
    memberId: row.memberId,
    address: row.externalAccountId,
    status: row.status,
    connectedAt: row.connectedAt,
    revokedAt: row.revokedAt,
    metadata: row.metadata,
  };
}

export async function getActiveInboundAlias(
  memberId: string,
): Promise<InboundAliasRecord | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: connections.id,
      memberId: connections.memberId,
      externalAccountId: connections.externalAccountId,
      status: connections.status,
      connectedAt: connections.connectedAt,
      revokedAt: connections.revokedAt,
      metadata: connections.metadata,
    })
    .from(connections)
    .where(
      and(
        eq(connections.memberId, memberId),
        eq(connections.provider, INBOUND_EMAIL_PROVIDER),
        eq(connections.status, "active"),
      ),
    )
    .limit(1);
  return row ? rowToAlias(row) : null;
}

export async function ensureInboundAlias(
  memberId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<InboundAliasRecord> {
  const existing = await getActiveInboundAlias(memberId);
  if (existing) return existing;

  const db = getDb();
  const address = buildInboundAddress(`gs_${mintLocalPart()}`, env);
  const [row] = await db
    .insert(connections)
    .values({
      memberId,
      provider: INBOUND_EMAIL_PROVIDER,
      externalAccountId: address,
      status: "active",
      scopes: ["job_alerts:receive"],
      metadata: {
        kind: "inbound_job_alerts",
        localPart: address.split("@")[0],
        domain: inboundDomain(env),
      },
    })
    .returning({
      id: connections.id,
      memberId: connections.memberId,
      externalAccountId: connections.externalAccountId,
      status: connections.status,
      connectedAt: connections.connectedAt,
      revokedAt: connections.revokedAt,
      metadata: connections.metadata,
    });

  if (!row) {
    throw new Error("Failed to create inbound alias");
  }
  return rowToAlias(row);
}

export async function revokeInboundAlias(memberId: string): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const updated = await db
    .update(connections)
    .set({
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(connections.memberId, memberId),
        eq(connections.provider, INBOUND_EMAIL_PROVIDER),
        eq(connections.status, "active"),
      ),
    )
    .returning({ id: connections.id });
  return updated.length > 0;
}

/**
 * Resolve an active inbound address to a member. Revoked aliases return null
 * so further mail is not attributed.
 */
export async function resolveMemberIdByInboundAddress(
  address: string,
): Promise<{ memberId: string; address: string } | null> {
  const normalized = normalizeEmailAddress(address);
  const db = getDb();
  const [row] = await db
    .select({
      memberId: connections.memberId,
      externalAccountId: connections.externalAccountId,
    })
    .from(connections)
    .where(
      and(
        eq(connections.provider, INBOUND_EMAIL_PROVIDER),
        eq(connections.status, "active"),
        sql`lower(${connections.externalAccountId}) = ${normalized}`,
      ),
    )
    .limit(1);

  if (!row?.externalAccountId) return null;
  return { memberId: row.memberId, address: row.externalAccountId };
}

export async function findRecipientAmong(
  recipients: string[],
): Promise<{ memberId: string; address: string } | null> {
  for (const recipient of recipients) {
    const resolved = await resolveMemberIdByInboundAddress(recipient);
    if (resolved) return resolved;
  }
  return null;
}

export async function getInboundIngestionStatus(
  memberId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<InboundIngestionStatus> {
  const db = getDb();
  const alias = await getActiveInboundAlias(memberId);
  const domain = inboundDomain(env);

  const [receiptStats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      lastReceivedAt: sql<Date | null>`max(${sourceItemReceipts.receivedAt})`,
    })
    .from(sourceItemReceipts)
    .innerJoin(sourceItems, eq(sourceItemReceipts.sourceItemId, sourceItems.id))
    .where(
      and(
        eq(sourceItems.memberId, memberId),
        eq(sourceItems.sourceType, "job_listing"),
      ),
    );

  const [quarantineStats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      lastAt: sql<Date | null>`max(${inboundQuarantine.createdAt})`,
    })
    .from(inboundQuarantine)
    .where(eq(inboundQuarantine.memberId, memberId));

  const [lastQuarantine] = await db
    .select({
      reason: inboundQuarantine.reason,
      createdAt: inboundQuarantine.createdAt,
    })
    .from(inboundQuarantine)
    .where(eq(inboundQuarantine.memberId, memberId))
    .orderBy(desc(inboundQuarantine.createdAt))
    .limit(1);

  return {
    alias,
    domainConfigured: Boolean(domain),
    domain,
    recentReceiptCount: receiptStats?.count ?? 0,
    recentQuarantineCount: quarantineStats?.count ?? 0,
    lastReceivedAt: receiptStats?.lastReceivedAt ?? null,
    lastQuarantineAt: lastQuarantine?.createdAt ?? quarantineStats?.lastAt ?? null,
    lastQuarantineReason: lastQuarantine?.reason ?? null,
  };
}
