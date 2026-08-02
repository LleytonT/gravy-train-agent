/**
 * Full inbound body retention policy.
 *
 * Product evidence defaults to a short excerpt. Full bodies (and raw HTML) may
 * be kept briefly for debugging parse failures, then must be stripped.
 *
 * Override with INBOUND_FULL_BODY_RETENTION_HOURS (default 168 = 7 days).
 */

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
