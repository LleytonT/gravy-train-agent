/**
 * Full inbound body retention policy.
 *
 * Product evidence defaults to a short excerpt. Full bodies (and raw HTML) may
 * be kept briefly for debugging parse failures, then must be stripped.
 *
 * Override with INBOUND_FULL_BODY_RETENTION_HOURS (default 168 = 7 days).
 * Call `purgeExpiredFullBodies()` from inbound processing (and smokes) to
 * enforce the TTL — write-time retention alone is not enough.
 */

import { eq } from "drizzle-orm";

import { getDb } from "../db/client.js";
import { inboundQuarantine, sourceItems } from "../db/schema.js";

export const DEFAULT_FULL_BODY_RETENTION_HOURS = 168;

export const RETENTION_POLICY_DOC = `
Inbound job-alert retention
---------------------------
- Always persist: board, title, company, location, canonical URL, content hash,
  short excerpt (≤500 chars), receipt metadata, and observed/received timestamps.
- Optionally persist full text/HTML in source_items.payload.fullBody for a short
  window so operators can debug quarantine and parser misses.
- Default full-body retention: 7 days (168 hours). Configure with
  INBOUND_FULL_BODY_RETENTION_HOURS.
- After retainedUntil, strip payload.fullBody / payload.fullHtml and set
  payload.fullBodyPurgedAt. Excerpts and listing metadata remain indefinitely
  as evidence.
- Quarantine rows store only a short excerpt plus error reason — never the full
  private body after the same retention window.
`.trim();

export function fullBodyRetentionHours(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.INBOUND_FULL_BODY_RETENTION_HOURS?.trim();
  if (!raw) return DEFAULT_FULL_BODY_RETENTION_HOURS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_FULL_BODY_RETENTION_HOURS;
  }
  return parsed;
}

export function fullBodyRetainedUntil(
  receivedAt: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Date {
  const hours = fullBodyRetentionHours(env);
  return new Date(receivedAt.getTime() + hours * 60 * 60 * 1000);
}

export function shouldRetainFullBody(
  retainedUntil: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!retainedUntil) return false;
  const until =
    typeof retainedUntil === "string" ? new Date(retainedUntil) : retainedUntil;
  if (Number.isNaN(until.getTime())) return false;
  return until.getTime() > now.getTime();
}

export function clipExcerpt(text: string, max = 500): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export type PurgeExpiredFullBodiesResult = {
  sourceItemsPurged: number;
  quarantinePurged: number;
};

function payloadHasFullBody(payload: Record<string, unknown>): boolean {
  return (
    typeof payload.fullBody === "string" || typeof payload.fullHtml === "string"
  );
}

function bodyRetentionExpired(
  payload: Record<string, unknown>,
  now: Date,
): boolean {
  if (!payloadHasFullBody(payload)) return false;
  const until = payload.fullBodyRetainedUntil;
  if (typeof until !== "string" || !until.trim()) return true;
  return !shouldRetainFullBody(until, now);
}

function stripFullBodies(
  payload: Record<string, unknown>,
  now: Date,
): Record<string, unknown> {
  const next = { ...payload };
  delete next.fullBody;
  delete next.fullHtml;
  next.fullBodyPurgedAt = now.toISOString();
  return next;
}

/**
 * Strip expired `fullBody` / `fullHtml` from source items and quarantine rows.
 * Excerpts and listing metadata remain. Idempotent. Scans a bounded batch so
 * inbound webhooks stay cheap.
 */
export async function purgeExpiredFullBodies(
  now: Date = new Date(),
  batchSize = 100,
): Promise<PurgeExpiredFullBodiesResult> {
  const db = getDb();
  let sourceItemsPurged = 0;
  let quarantinePurged = 0;

  const items = await db
    .select({ id: sourceItems.id, payload: sourceItems.payload })
    .from(sourceItems)
    .limit(batchSize);
  for (const item of items) {
    if (!bodyRetentionExpired(item.payload, now)) continue;
    await db
      .update(sourceItems)
      .set({ payload: stripFullBodies(item.payload, now) })
      .where(eq(sourceItems.id, item.id));
    sourceItemsPurged += 1;
  }

  const quarantines = await db
    .select({ id: inboundQuarantine.id, payload: inboundQuarantine.payload })
    .from(inboundQuarantine)
    .limit(batchSize);
  for (const row of quarantines) {
    if (!bodyRetentionExpired(row.payload, now)) continue;
    await db
      .update(inboundQuarantine)
      .set({ payload: stripFullBodies(row.payload, now) })
      .where(eq(inboundQuarantine.id, row.id));
    quarantinePurged += 1;
  }

  return { sourceItemsPurged, quarantinePurged };
}
