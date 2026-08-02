/**
 * High-level inbound job-alert processing behind one deep interface.
 */

import { findRecipientAmong } from "../aliases.js";
import { canonicalizeJobUrl } from "../canonical-url.js";
import { listingContentHash } from "../hash.js";
import { ingestSourceItems } from "../ingest.js";
import { quarantineInbound } from "../quarantine.js";
import {
  clipExcerpt,
  fullBodyRetainedUntil,
  purgeExpiredFullBodies,
  shouldRetainFullBody,
} from "../retention.js";
import {
  RESEND_RECEIPT_PROVIDER,
  SOURCE_TYPE_JOB_LISTING,
  type IngestResult,
  type ParsedJobListing,
  type ReceivedEmailContent,
  type SourceItemInput,
} from "../types.js";
import { parseJobAlertEmail } from "./parse.js";

export type ProcessInboundEmailResult =
  | {
      status: "ingested";
      memberId: string;
      recipientAddress: string;
      board: string;
      ingest: IngestResult;
    }
  | {
      status: "quarantined";
      reason: string;
      quarantineId: string;
      memberId?: string | null;
    };

function recipientsOf(email: ReceivedEmailContent): string[] {
  return [...email.to].filter(Boolean);
}

function listingInputs(
  email: ReceivedEmailContent,
  memberId: string,
  listings: ParsedJobListing[],
): SourceItemInput[] {
  const retainedUntil = fullBodyRetainedUntil();
  const retain = shouldRetainFullBody(retainedUntil);

  return listings.map((listing, index) => {
    const canonicalUrl = canonicalizeJobUrl(listing.url);
    const contentHash = listingContentHash({
      url: canonicalUrl,
      title: listing.title,
      company: listing.company,
      location: listing.location,
    });

    const payload: Record<string, unknown> = {
      board: listing.board,
      company: listing.company ?? null,
      location: listing.location ?? null,
      sourceEmailId: email.emailId,
      sourceSubject: email.subject,
      sourceFrom: email.from,
      fullBodyRetainedUntil: retainedUntil.toISOString(),
    };
    if (retain) {
      if (email.text) payload.fullBody = clipExcerpt(email.text, 20_000);
      if (email.html) payload.fullHtml = clipExcerpt(email.html, 40_000);
    }

    return {
      memberId,
      sourceType: SOURCE_TYPE_JOB_LISTING,
      visibility: "member" as const,
      externalId: canonicalUrl ?? `${email.emailId}:${index}`,
      canonicalUrl,
      contentHash,
      title: listing.title,
      excerpt: listing.excerpt,
      payload,
      observedAt: listing.observedAt ?? (email.createdAt ? new Date(email.createdAt) : null),
      receipt: {
        provider: RESEND_RECEIPT_PROVIDER,
        idempotencyKey: `${RESEND_RECEIPT_PROVIDER}:${email.emailId}:listing:${index}`,
        metadata: {
          emailId: email.emailId,
          messageId: email.messageId ?? null,
          board: listing.board,
          listingIndex: index,
        },
      },
    };
  });
}

export async function processInboundJobAlertEmail(
  email: ReceivedEmailContent,
): Promise<ProcessInboundEmailResult> {
  // Opportunistic TTL enforcement — excerpts stay; full bodies are stripped.
  await purgeExpiredFullBodies().catch(() => {
    // Never fail inbound ingest because purge could not run.
  });

  const recipients = recipientsOf(email);
  const resolved = await findRecipientAmong(recipients);
  const quarantineKey = `${RESEND_RECEIPT_PROVIDER}:${email.emailId}:quarantine`;

  if (!resolved) {
    const quarantined = await quarantineInbound({
      memberId: null,
      provider: RESEND_RECEIPT_PROVIDER,
      idempotencyKey: quarantineKey,
      reason: "unknown_or_revoked_alias",
      recipientAddress: recipients[0] ?? null,
      subject: email.subject,
      excerpt: clipExcerpt(`${email.subject} from ${email.from}`),
      payload: {
        emailId: email.emailId,
        to: recipients,
        from: email.from,
      },
    });
    return {
      status: "quarantined",
      reason: quarantined.reason,
      quarantineId: quarantined.id,
      memberId: null,
    };
  }

  const parsed = parseJobAlertEmail({
    from: email.from,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  if (!parsed.ok) {
    const quarantined = await quarantineInbound({
      memberId: resolved.memberId,
      provider: RESEND_RECEIPT_PROVIDER,
      idempotencyKey: quarantineKey,
      reason: parsed.reason,
      recipientAddress: resolved.address,
      subject: email.subject,
      excerpt: clipExcerpt(email.text ?? email.subject),
      payload: {
        emailId: email.emailId,
        to: recipients,
        from: email.from,
      },
    });
    return {
      status: "quarantined",
      reason: quarantined.reason,
      quarantineId: quarantined.id,
      memberId: resolved.memberId,
    };
  }

  const ingest = await ingestSourceItems(
    listingInputs(email, resolved.memberId, parsed.listings),
  );

  return {
    status: "ingested",
    memberId: resolved.memberId,
    recipientAddress: resolved.address,
    board: parsed.board,
    ingest,
  };
}
