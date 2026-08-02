export {
  ensureInboundAlias,
  getActiveInboundAlias,
  getInboundIngestionStatus,
  revokeInboundAlias,
  resolveMemberIdByInboundAddress,
  findRecipientAmong,
  buildInboundAddress,
  normalizeEmailAddress,
} from "./aliases.js";
export { canonicalizeJobUrl } from "./canonical-url.js";
export { listingContentHash, sha256Hex } from "./hash.js";
export { ingestSourceItems } from "./ingest.js";
export { parseJobAlertEmail } from "./job-alerts/parse.js";
export { processInboundJobAlertEmail } from "./job-alerts/process.js";
export { quarantineInbound } from "./quarantine.js";
export {
  DEFAULT_FULL_BODY_RETENTION_HOURS,
  RETENTION_POLICY_DOC,
  clipExcerpt,
  fullBodyRetentionHours,
  fullBodyRetainedUntil,
  shouldRetainFullBody,
} from "./retention.js";
export { fetchReceivedEmailContent } from "./resend/fetch-email.js";
export {
  verifyResendWebhook,
  WebhookVerificationError,
} from "./resend/verify.js";
export type {
  IngestResult,
  JobAlertParseResult,
  ParsedJobListing,
  ReceivedEmailContent,
  SourceItemInput,
} from "./types.js";
export {
  INBOUND_EMAIL_PROVIDER,
  RESEND_RECEIPT_PROVIDER,
  SOURCE_TYPE_JOB_LISTING,
} from "./types.js";
