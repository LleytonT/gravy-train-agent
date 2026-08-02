/**
 * Shared source-item contract for every ingestion adapter.
 * Downstream intelligence must not depend on provider-specific payloads.
 */

export const SOURCE_TYPE_JOB_LISTING = "job_listing";
export const INBOUND_EMAIL_PROVIDER = "inbound_email";
export const RESEND_RECEIPT_PROVIDER = "resend";

export type SourceVisibility = "public" | "member";

export type SourceItemReceiptInput = {
  provider: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export type SourceItemInput = {
  memberId: string | null;
  sourceType: string;
  visibility: SourceVisibility;
  externalId?: string | null;
  canonicalUrl?: string | null;
  contentHash: string;
  title?: string | null;
  excerpt: string;
  payload?: Record<string, unknown>;
  observedAt?: Date | null;
  receipt: SourceItemReceiptInput;
};

export type IngestedSourceItem = {
  id: string;
  contentHash: string;
  created: boolean;
  receiptCreated: boolean;
};

export type IngestResult = {
  items: IngestedSourceItem[];
  insertedCount: number;
  duplicateReceiptCount: number;
  linkedExistingCount: number;
};

export type JobBoard = "linkedin" | "seek" | "indeed" | "generic";

export type ParsedJobListing = {
  board: JobBoard;
  title: string;
  company?: string;
  location?: string;
  url?: string;
  excerpt: string;
  observedAt?: Date;
};

export type JobAlertParseSuccess = {
  ok: true;
  board: JobBoard;
  listings: ParsedJobListing[];
};

export type JobAlertParseFailure = {
  ok: false;
  reason: string;
};

export type JobAlertParseResult = JobAlertParseSuccess | JobAlertParseFailure;

export type ReceivedEmailContent = {
  emailId: string;
  messageId?: string | null;
  from: string;
  to: string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  createdAt?: string | null;
};

export type QuarantineInput = {
  memberId?: string | null;
  provider: string;
  idempotencyKey: string;
  reason: string;
  recipientAddress?: string | null;
  subject?: string | null;
  excerpt?: string;
  payload?: Record<string, unknown>;
};
