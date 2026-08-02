/**
 * Discovery orchestrator contracts (GS-007).
 *
 * One deep seam: runDiscovery(trigger) → DiscoveryRunOutcome.
 * Eve schedules and developer smoke commands call the same method.
 */

export const SCORE_VERSION = "scoring.ts@v1";

/** Distinct candidate-role labels required by GS-007 acceptance. */
export const CANDIDATE_ROLE_KINDS = [
  "advertised",
  "rumored",
  "inferred",
] as const;
export type CandidateRoleKind = (typeof CANDIDATE_ROLE_KINDS)[number];

export const DEFAULT_DISCOVERY_LIMITS = {
  maxSourceItems: 50,
  maxWebSearches: 5,
  maxModelCalls: 20,
} as const;

export type DiscoveryLimits = {
  maxSourceItems: number;
  maxWebSearches: number;
  maxModelCalls: number;
};

export type DiscoveryTriggerKind = "schedule" | "manual" | "retry";

export type DiscoveryTrigger = {
  kind: DiscoveryTriggerKind;
  /** Unique claim key — retries with the same key do not re-run completed work. */
  idempotencyKey: string;
  /** Optional member scope; omit to process all eligible members/items. */
  memberId?: string | null;
  asOf?: Date;
  limits?: Partial<DiscoveryLimits>;
  /**
   * When true, skip live web enrichment (tests / offline). Default false.
   */
  skipWebSearch?: boolean;
};

export type DiscoveryRunCounts = {
  sourceItemsProcessed: number;
  signalsUpserted: number;
  dossiersRefreshed: number;
  candidatesUpserted: number;
  opportunitiesUpserted: number;
  opportunitiesExcludedByConstraint: number;
  digestsDelivered: number;
  digestsSkipped: number;
};

export type DiscoveryRunLimitsUsed = {
  webSearchesUsed: number;
  modelCallsUsed: number;
  maxWebSearches: number;
  maxModelCalls: number;
};

export type DiscoveryRunStatus =
  | "completed"
  | "failed"
  | "noop"
  | "already_completed";

export type DiscoveryRunOutcome = {
  runId: string;
  status: DiscoveryRunStatus;
  counts: DiscoveryRunCounts;
  limits: DiscoveryRunLimitsUsed;
  error?: string;
};

export type LimitTracker = {
  limits: DiscoveryLimits;
  webSearchesUsed: number;
  modelCallsUsed: number;
  canWebSearch(): boolean;
  recordWebSearch(): void;
  canModelCall(): boolean;
  recordModelCall(): void;
  snapshot(): DiscoveryRunLimitsUsed;
};
