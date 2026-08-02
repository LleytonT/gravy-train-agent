#!/usr/bin/env npx tsx
/**
 * GS-006 acceptance smoke: parsers, webhook verification, ingest idempotency,
 * cross-board collapse, quarantine, and alias revocation.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

const { ensureSchema, getDb } = await import("../agent/lib/db/client.js");
const {
  members,
  connections,
  sourceItems,
  sourceItemReceipts,
  inboundQuarantine,
} = await import("../agent/lib/db/schema.js");
const {
  canonicalizeJobUrl,
  listingContentHash,
  parseJobAlertEmail,
  ingestSourceItems,
  processInboundJobAlertEmail,
  ensureInboundAlias,
  revokeInboundAlias,
  verifyResendWebhook,
  WebhookVerificationError,
  SOURCE_TYPE_JOB_LISTING,
  RESEND_RECEIPT_PROVIDER,
} = await import("../agent/lib/ingestion/index.js");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixture(name: string): string {
  return readFileSync(
    resolve("agent/lib/ingestion/fixtures", name),
    "utf8",
  );
}

async function main() {
  // --- Pure parser / hash checks (no DB) ---
  const linkedin = parseJobAlertEmail({
    from: "jymbii-noreply@linkedin.com",
    subject: "Jobs for you",
    html: fixture("linkedin-multi.html"),
  });
  assert(linkedin.ok, "linkedin fixture should parse");
  assert(linkedin.ok && linkedin.listings.length === 2, "linkedin multi listings");

  const seek = parseJobAlertEmail({
    from: "noreply@seek.com.au",
    subject: "Seek job alert",
    html: fixture("seek-multi.html"),
  });
  assert(seek.ok, "seek fixture should parse");
  assert(seek.ok && seek.listings.length === 2, "seek multi listings");

  const indeed = parseJobAlertEmail({
    from: "noreply@indeed.com",
    subject: "Indeed jobs",
    html: fixture("indeed-multi.html"),
  });
  assert(indeed.ok, "indeed fixture should parse");
  assert(indeed.ok && indeed.listings.length === 2, "indeed multi listings");

  const generic = parseJobAlertEmail({
    from: "alerts@example.com",
    subject: "New role at Anthropic",
    text: fixture("generic-single.txt"),
  });
  assert(generic.ok, "generic fixture should parse");
  assert(generic.ok && generic.listings.length >= 1, "generic listing");

  const urlA = canonicalizeJobUrl(
    "https://www.linkedin.com/jobs/view/12345/?trk=eml_jymbii&utm_campaign=jobs",
  );
  const urlB = canonicalizeJobUrl(
    "https://www.linkedin.com/jobs/view/12345/?utm_source=indeed",
  );
  assert(urlA === urlB, "canonical URLs must match across boards");
  assert(
    listingContentHash({ url: urlA, title: "Sales Engineer", company: "Decagon" }) ===
      listingContentHash({ url: urlB, title: "Sales Engineer", company: "Decagon" }),
    "content hashes must collapse cross-board duplicates",
  );

  let rejectedUnsigned = false;
  try {
    verifyResendWebhook({
      payload: '{"type":"email.received"}',
      headers: {},
      webhookSecret: "whsec_test",
    });
  } catch (error) {
    rejectedUnsigned = error instanceof WebhookVerificationError;
  }
  assert(rejectedUnsigned, "unsigned webhooks must be rejected");

  let rejectedForged = false;
  try {
    verifyResendWebhook({
      payload: '{"type":"email.received"}',
      headers: {
        id: "msg_fake",
        timestamp: "1614265330",
        signature: "v1,not-a-real-signature",
      },
      webhookSecret: "whsec_test",
      verifyFn: () => {
        throw new Error("invalid signature");
      },
    });
  } catch (error) {
    rejectedForged = error instanceof WebhookVerificationError;
  }
  assert(rejectedForged, "forged webhooks must be rejected");

  const proxy = readFileSync(resolve("proxy.ts"), "utf8");
  assert(
    proxy.includes("/api/inbound/resend"),
    "proxy must allow public Resend webhook route",
  );

  // --- DB-backed acceptance ---
  process.env.RESEND_INBOUND_DOMAIN =
    process.env.RESEND_INBOUND_DOMAIN?.trim() || "alerts.example.invalid";

  await ensureSchema();
  const db = getDb();
  const runId = randomUUID();
  const memberIds: string[] = [];
  const sourceItemIds: string[] = [];

  try {
    const [member] = await db
      .insert(members)
      .values({
        externalAuthId: `inbound-smoke-${runId}`,
        email: `inbound-${runId}@example.invalid`,
        displayName: "Inbound Smoke",
      })
      .returning({ id: members.id });
    assert(member, "member created");
    memberIds.push(member.id);

    const alias = await ensureInboundAlias(member.id);
    assert(alias.address.endsWith("@alerts.example.invalid") || alias.address.includes("@"), "alias address");
    const aliasAgain = await ensureInboundAlias(member.id);
    assert(alias.connectionId === aliasAgain.connectionId, "alias ensure is idempotent");

    const emailId = `email-${runId}`;
    const first = await processInboundJobAlertEmail({
      emailId,
      from: "jymbii-noreply@linkedin.com",
      to: [alias.address],
      subject: "Jobs for you",
      html: fixture("linkedin-multi.html"),
      createdAt: new Date().toISOString(),
    });
    assert(first.status === "ingested", "multi-listing email should ingest");
    if (first.status === "ingested") {
      assert(first.ingest.insertedCount === 2, "two distinct listings inserted");
      sourceItemIds.push(...first.ingest.items.map((item) => item.id));
    }

    const retry = await processInboundJobAlertEmail({
      emailId,
      from: "jymbii-noreply@linkedin.com",
      to: [alias.address],
      subject: "Jobs for you",
      html: fixture("linkedin-multi.html"),
    });
    assert(retry.status === "ingested", "retry should still report ingested");
    if (retry.status === "ingested") {
      assert(retry.ingest.duplicateReceiptCount === 2, "retry must not duplicate receipts");
      assert(retry.ingest.insertedCount === 0, "retry inserts nothing new");
    }

    const sharedUrl =
      "https://www.linkedin.com/jobs/view/55555/?utm_source=linkedin";
    const sharedHash = listingContentHash({
      url: sharedUrl,
      title: "Sales Engineer",
      company: "Decagon",
    });
    const boardA = await ingestSourceItems([
      {
        memberId: member.id,
        sourceType: SOURCE_TYPE_JOB_LISTING,
        visibility: "member",
        canonicalUrl: canonicalizeJobUrl(sharedUrl),
        contentHash: sharedHash,
        title: "Sales Engineer",
        excerpt: "Sales Engineer at Decagon",
        payload: { board: "linkedin" },
        receipt: {
          provider: RESEND_RECEIPT_PROVIDER,
          idempotencyKey: `${RESEND_RECEIPT_PROVIDER}:cross-${runId}:a`,
        },
      },
    ]);
    const boardB = await ingestSourceItems([
      {
        memberId: member.id,
        sourceType: SOURCE_TYPE_JOB_LISTING,
        visibility: "member",
        canonicalUrl: canonicalizeJobUrl(
          "https://www.linkedin.com/jobs/view/55555/?utm_source=indeed",
        ),
        contentHash: listingContentHash({
          url: "https://www.linkedin.com/jobs/view/55555/?utm_source=indeed",
          title: "Sales Engineer",
          company: "Decagon",
        }),
        title: "Sales Engineer",
        excerpt: "Sales Engineer — Decagon",
        payload: { board: "indeed" },
        receipt: {
          provider: RESEND_RECEIPT_PROVIDER,
          idempotencyKey: `${RESEND_RECEIPT_PROVIDER}:cross-${runId}:b`,
        },
      },
    ]);
    assert(boardA.insertedCount === 1, "first board inserts");
    assert(boardB.linkedExistingCount === 1, "second board links existing");
    assert(
      boardA.items[0]?.id === boardB.items[0]?.id,
      "cross-board listings collapse to one source item",
    );
    sourceItemIds.push(boardA.items[0]!.id);

    const bad = await processInboundJobAlertEmail({
      emailId: `bad-${runId}`,
      from: "random@example.com",
      to: [alias.address],
      subject: "Hello",
      text: "no jobs here",
    });
    assert(bad.status === "quarantined", "invalid mail is quarantined");
    assert(bad.status === "quarantined" && bad.reason.includes("no_listings"), "parse failure reason");

    const revoked = await revokeInboundAlias(member.id);
    assert(revoked, "alias revoked");
    const afterRevoke = await processInboundJobAlertEmail({
      emailId: `revoked-${runId}`,
      from: "jymbii-noreply@linkedin.com",
      to: [alias.address],
      subject: "Jobs for you",
      html: fixture("linkedin-multi.html"),
    });
    assert(afterRevoke.status === "quarantined", "revoked alias not attributed");
    assert(
      afterRevoke.status === "quarantined" &&
        afterRevoke.reason === "unknown_or_revoked_alias",
      "revocation reason",
    );

    const [quarantineRows] = await db
      .select()
      .from(inboundQuarantine)
      .where(
        and(
          eq(inboundQuarantine.provider, RESEND_RECEIPT_PROVIDER),
          eq(inboundQuarantine.idempotencyKey, `${RESEND_RECEIPT_PROVIDER}:revoked-${runId}:quarantine`),
        ),
      );
    assert(quarantineRows, "quarantine row observable");

    console.log("smoke-inbound: ok");
  } finally {
    if (sourceItemIds.length > 0) {
      await db
        .delete(sourceItemReceipts)
        .where(inArray(sourceItemReceipts.sourceItemId, sourceItemIds));
      await db.delete(sourceItems).where(inArray(sourceItems.id, sourceItemIds));
    }
    if (memberIds.length > 0) {
      await db
        .delete(inboundQuarantine)
        .where(inArray(inboundQuarantine.memberId, memberIds));
      await db.delete(connections).where(inArray(connections.memberId, memberIds));
      // Also quarantine rows with null member from unknown alias tests in this run
      await db
        .delete(inboundQuarantine)
        .where(
          inArray(inboundQuarantine.idempotencyKey, [
            `${RESEND_RECEIPT_PROVIDER}:revoked-${runId}:quarantine`,
            `${RESEND_RECEIPT_PROVIDER}:bad-${runId}:quarantine`,
          ]),
        );
      await db.delete(members).where(inArray(members.id, memberIds));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
