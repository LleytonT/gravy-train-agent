import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const rawItemSources = ["linkedin", "x"] as const;
export type RawItemSource = (typeof rawItemSources)[number];

export const watchlistTiers = ["hot", "warm", "ignore"] as const;
export type WatchlistTier = (typeof watchlistTiers)[number];

export const signalDirections = ["positive", "negative"] as const;
export type SignalDirection = (typeof signalDirections)[number];

export const opportunityStatuses = [
  "new",
  "pinged",
  "discussed",
  "dismissed",
  "pursuing",
] as const;
export type OpportunityStatus = (typeof opportunityStatuses)[number];

export const channelProviders = ["telegram"] as const;
export type ChannelProvider = (typeof channelProviders)[number];

export const conversationSurfaces = ["web", "telegram", "system"] as const;
export type ConversationSurface = (typeof conversationSurfaces)[number];

export const messageRoles = ["member", "assistant", "system"] as const;
export type MessageRole = (typeof messageRoles)[number];

export const preferenceProvenance = ["explicit", "inferred", "imported"] as const;
export type PreferenceProvenance = (typeof preferenceProvenance)[number];

export const discoveryRunStatuses = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type DiscoveryRunStatus = (typeof discoveryRunStatuses)[number];

export const deliveryStatuses = [
  "pending",
  "sent",
  "failed",
  "skipped",
] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];

export const sourceVisibilities = ["public", "member"] as const;
export type SourceVisibility = (typeof sourceVisibilities)[number];

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const members = pgTable(
  "members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalAuthId: text("external_auth_id").unique(),
    email: text("email"),
    displayName: text("display_name"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("idx_members_external_auth_id").on(table.externalAuthId)],
);

export const channelIdentities = pgTable(
  "channel_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: channelProviders }).notNull(),
    externalUserId: text("external_user_id").notNull(),
    username: text("username"),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_channel_identities_provider_user").on(
      table.provider,
      table.externalUserId,
    ),
    index("idx_channel_identities_member_id").on(table.memberId),
  ],
);

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalAccountId: text("external_account_id"),
    status: text("status").notNull().default("active"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_connections_member_id").on(table.memberId),
    uniqueIndex("uq_connections_active_inbound_address")
      .on(table.provider, table.externalAccountId)
      .where(sql`${table.provider} = 'inbound_email' AND ${table.status} = 'active'`),
    uniqueIndex("uq_connections_member_active_inbound")
      .on(table.memberId)
      .where(sql`${table.provider} = 'inbound_email' AND ${table.status} = 'active'`),
  ],
);

export const careerProfiles = pgTable(
  "career_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    currentTitle: text("current_title"),
    currentCompany: text("current_company"),
    location: text("location"),
    summary: text("summary"),
    profile: jsonb("profile")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_career_profiles_member_id").on(table.memberId),
  ],
);

export const preferences = pgTable(
  "preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    provenance: text("provenance", { enum: preferenceProvenance }).notNull(),
    confidence: doublePrecision("confidence"),
    sourceRef: text("source_ref"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_preferences_member_key_provenance").on(
      table.memberId,
      table.key,
      table.provenance,
    ),
    index("idx_preferences_member_id").on(table.memberId),
  ],
);

export const feedbackEvents = pgTable(
  "feedback_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [index("idx_feedback_events_member_id").on(table.memberId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New scout"),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_conversations_id_member").on(table.id, table.memberId),
    index("idx_conversations_member_id").on(table.memberId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id").notNull(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    role: text("role", { enum: messageRoles }).notNull(),
    surface: text("surface", { enum: conversationSurfaces }).notNull(),
    body: text("body").notNull(),
    externalMessageId: text("external_message_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "fk_messages_conversation_member",
      columns: [table.conversationId, table.memberId],
      foreignColumns: [conversations.id, conversations.memberId],
    }).onDelete("cascade"),
    index("idx_messages_conversation_created").on(
      table.conversationId,
      table.createdAt,
    ),
    index("idx_messages_member_id").on(table.memberId),
  ],
);

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id").notNull(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    surface: text("surface", { enum: conversationSurfaces }).notNull(),
    eveSessionId: text("eve_session_id").notNull(),
    continuationTokenRef: text("continuation_token_ref"),
    summary: text("summary"),
    lastEventIndex: integer("last_event_index").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "fk_agent_sessions_conversation_member",
      columns: [table.conversationId, table.memberId],
      foreignColumns: [conversations.id, conversations.memberId],
    }).onDelete("cascade"),
    uniqueIndex("uq_agent_sessions_surface_session").on(
      table.surface,
      table.eveSessionId,
    ),
    uniqueIndex("uq_agent_sessions_conversation_surface").on(
      table.conversationId,
      table.surface,
    ),
    index("idx_agent_sessions_conversation_id").on(table.conversationId),
  ],
);

/**
 * Legacy prototype feed items. New ingestion work writes to source_items; this
 * table remains temporarily so the existing capture and scoring tools keep
 * working while their adapter is migrated.
 */
export const rawItems = pgTable(
  "raw_items",
  {
    id: text("id").primaryKey(),
    source: text("source", { enum: rawItemSources }).notNull(),
    author: text("author").notNull(),
    authorHeadline: text("author_headline"),
    excerpt: text("excerpt").notNull(),
    url: text("url").notNull().unique(),
    urlHash: text("url_hash").notNull(),
    postedAt: text("posted_at"),
    capturedAt: text("captured_at").notNull(),
    processed: integer("processed").notNull().default(0),
  },
  (table) => [index("idx_raw_items_processed").on(table.processed)],
);

export const sourceItems = pgTable(
  "source_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id").references(() => members.id, {
      onDelete: "cascade",
    }),
    sourceType: text("source_type").notNull(),
    visibility: text("visibility", { enum: sourceVisibilities })
      .notNull()
      .default("public"),
    externalId: text("external_id"),
    canonicalUrl: text("canonical_url"),
    contentHash: text("content_hash").notNull(),
    title: text("title"),
    excerpt: text("excerpt").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("uq_source_items_member_type_hash")
      .on(table.memberId, table.sourceType, table.contentHash)
      .nullsNotDistinct(),
    check(
      "chk_source_items_member_visibility",
      sql`${table.visibility} = 'public' OR ${table.memberId} IS NOT NULL`,
    ),
    index("idx_source_items_member_id").on(table.memberId),
    index("idx_source_items_processed_at").on(table.processedAt),
  ],
);

export const sourceItemReceipts = pgTable(
  "source_item_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  },
  (table) => [index("idx_source_item_receipts_item").on(table.sourceItemId)],
);

/**
 * Observable quarantine for inbound mail that could not be attributed or parsed.
 * Invalid mail is never silently dropped.
 */
export const inboundQuarantine = pgTable(
  "inbound_quarantine",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    reason: text("reason").notNull(),
    recipientAddress: text("recipient_address"),
    subject: text("subject"),
    excerpt: text("excerpt").notNull().default(""),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_inbound_quarantine_member_id").on(table.memberId),
    index("idx_inbound_quarantine_created_at").on(table.createdAt),
  ],
);

export const companies = pgTable(
  "companies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    aliases: text("aliases").notNull().default("[]"),
    website: text("website"),
    category: text("category"),
    watchlistTier: text("watchlist_tier", { enum: watchlistTiers })
      .notNull()
      .default("warm"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_companies_watchlist_tier").on(table.watchlistTier),
  ],
);

export const companyAliases = pgTable(
  "company_aliases",
  {
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.alias] }),
    uniqueIndex("uq_company_aliases_alias").on(table.alias),
  ],
);

export const signals = pgTable(
  "signals",
  {
    id: text("id").primaryKey(),
    memberId: uuid("member_id").references(() => members.id, {
      onDelete: "cascade",
    }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    type: text("type").notNull(),
    direction: text("direction", { enum: signalDirections }).notNull(),
    strength: integer("strength").notNull(),
    summary: text("summary").notNull(),
    sourceUrl: text("source_url"),
    excerpt: text("excerpt"),
    observedAt: text("observed_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_signals_company_id").on(table.companyId),
    index("idx_signals_member_id").on(table.memberId),
    index("idx_signals_observed_at").on(table.observedAt),
  ],
);

export const signalSources = pgTable(
  "signal_sources",
  {
    signalId: text("signal_id")
      .notNull()
      .references(() => signals.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.signalId, table.sourceItemId] }),
    index("idx_signal_sources_source_item").on(table.sourceItemId),
  ],
);

export const companyDossiers = pgTable(
  "company_dossiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    facts: jsonb("facts")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    version: integer("version").notNull().default(1),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_company_dossiers_company_id").on(table.companyId),
  ],
);

export const peopleWatchlist = pgTable("people_watchlist", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currentCompany: text("current_company"),
  whyWatched: text("why_watched"),
  sourceUrl: text("source_url"),
  createdAt: text("created_at").notNull(),
});

export const openRoleStatuses = ["open", "rumored", "filled"] as const;
export type OpenRoleStatus = (typeof openRoleStatuses)[number];

export const outreachKinds = [
  "hiring_manager",
  "peer_in_seat",
  "adjacent",
] as const;
export type OutreachKind = (typeof outreachKinds)[number];

/** Known / rumored seats at gravy-train companies for role matching. */
export const openRoles = pgTable(
  "open_roles",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    title: text("title").notNull(),
    location: text("location"),
    sourceUrl: text("source_url"),
    status: text("status", { enum: openRoleStatuses }).notNull().default("open"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_open_roles_company_id").on(table.companyId)],
);

export const candidateRoles = pgTable(
  "candidate_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id").references(() => members.id, {
      onDelete: "cascade",
    }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id").references(() => sourceItems.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    location: text("location"),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("active"),
    canonicalUrl: text("canonical_url"),
    confidence: doublePrecision("confidence").notNull().default(0),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_candidate_roles_company_id").on(table.companyId),
    index("idx_candidate_roles_member_id").on(table.memberId),
    index("idx_candidate_roles_source_item_id").on(table.sourceItemId),
  ],
);

/** People to contact about a role: hiring manager, peer in seat, adjacent. */
export const outreachTargets = pgTable(
  "outreach_targets",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    title: text("title").notNull(),
    kind: text("kind", { enum: outreachKinds }).notNull(),
    linkedInUrl: text("linkedin_url"),
    whyReachOut: text("why_reach_out").notNull(),
    relatedRoleTitle: text("related_role_title"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_outreach_targets_company_id").on(table.companyId)],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    memberId: uuid("member_id").references(() => members.id, {
      onDelete: "cascade",
    }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    headline: text("headline").notNull(),
    score: doublePrecision("score").notNull(),
    pingedAt: text("pinged_at"),
    status: text("status", { enum: opportunityStatuses }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_opportunities_member_id").on(table.memberId),
    index("idx_opportunities_company_id").on(table.companyId),
  ],
);

export const opportunityEvidence = pgTable(
  "opportunity_evidence",
  {
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    signalId: text("signal_id")
      .notNull()
      .references(() => signals.id, { onDelete: "cascade" }),
    weight: doublePrecision("weight").notNull().default(1),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.opportunityId, table.signalId] }),
    index("idx_opportunity_evidence_signal_id").on(table.signalId),
  ],
);

export const runLogs = pgTable("run_logs", {
  id: text("id").primaryKey(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  summary: text("summary"),
  itemsProcessed: integer("items_processed").notNull().default(0),
  signalsFound: integer("signals_found").notNull().default(0),
  pingsSent: integer("pings_sent").notNull().default(0),
});

export const discoveryRuns = pgTable(
  "discovery_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status", { enum: discoveryRunStatuses })
      .notNull()
      .default("pending"),
    trigger: text("trigger").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    outcome: jsonb("outcome")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("idx_discovery_runs_status").on(table.status)],
);

export const digestDeliveries = pgTable(
  "digest_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    discoveryRunId: uuid("discovery_run_id").references(
      () => discoveryRuns.id,
      { onDelete: "set null" },
    ),
    conversationId: uuid("conversation_id"),
    channel: text("channel", { enum: conversationSurfaces }).notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status", { enum: deliveryStatuses })
      .notNull()
      .default("pending"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "fk_digest_deliveries_conversation_member",
      columns: [table.conversationId, table.memberId],
      foreignColumns: [conversations.id, conversations.memberId],
    }).onDelete("cascade"),
    index("idx_digest_deliveries_member_id").on(table.memberId),
    index("idx_digest_deliveries_run_id").on(table.discoveryRunId),
  ],
);

export type RawItem = typeof rawItems.$inferSelect;
export type NewRawItem = typeof rawItems.$inferInsert;

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;

export type PersonWatchlist = typeof peopleWatchlist.$inferSelect;
export type NewPersonWatchlist = typeof peopleWatchlist.$inferInsert;

export type OpenRole = typeof openRoles.$inferSelect;
export type NewOpenRole = typeof openRoles.$inferInsert;

export type OutreachTarget = typeof outreachTargets.$inferSelect;
export type NewOutreachTarget = typeof outreachTargets.$inferInsert;

export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;

export type RunLog = typeof runLogs.$inferSelect;
export type NewRunLog = typeof runLogs.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type AgentSession = typeof agentSessions.$inferSelect;
export type NewAgentSession = typeof agentSessions.$inferInsert;

export const schema = {
  members,
  channelIdentities,
  connections,
  careerProfiles,
  preferences,
  feedbackEvents,
  conversations,
  messages,
  agentSessions,
  rawItems,
  sourceItems,
  sourceItemReceipts,
  inboundQuarantine,
  companies,
  companyAliases,
  signals,
  signalSources,
  companyDossiers,
  peopleWatchlist,
  openRoles,
  candidateRoles,
  outreachTargets,
  opportunities,
  opportunityEvidence,
  runLogs,
  discoveryRuns,
  digestDeliveries,
} as const;

export type Schema = typeof schema;
