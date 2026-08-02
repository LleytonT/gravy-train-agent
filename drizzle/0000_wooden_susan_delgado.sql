CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"surface" text NOT NULL,
	"eve_session_id" text NOT NULL,
	"continuation_token_ref" text,
	"summary" text,
	"last_event_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"source_item_id" uuid,
	"title" text NOT NULL,
	"location" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"canonical_url" text,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"current_title" text,
	"current_company" text,
	"location" text,
	"summary" text,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_user_id" text NOT NULL,
	"username" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" text DEFAULT '[]' NOT NULL,
	"website" text,
	"category" text,
	"watchlist_tier" text DEFAULT 'warm' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_aliases" (
	"company_id" text NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_aliases_company_id_alias_pk" PRIMARY KEY("company_id","alias")
);
--> statement-breakpoint
CREATE TABLE "company_dossiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"summary" text NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"title" text DEFAULT 'New scout' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"discovery_run_id" uuid,
	"conversation_id" uuid,
	"channel" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"attempted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_deliveries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "discovery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"outcome" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_runs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "feedback_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_auth_id" text,
	"email" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_external_auth_id_unique" UNIQUE("external_auth_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role" text NOT NULL,
	"surface" text NOT NULL,
	"body" text NOT NULL,
	"external_message_id" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "open_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"source_url" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" uuid,
	"company_id" text NOT NULL,
	"headline" text NOT NULL,
	"score" double precision NOT NULL,
	"pinged_at" text,
	"status" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_evidence" (
	"opportunity_id" text NOT NULL,
	"signal_id" text NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_evidence_opportunity_id_signal_id_pk" PRIMARY KEY("opportunity_id","signal_id")
);
--> statement-breakpoint
CREATE TABLE "outreach_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"linkedin_url" text,
	"why_reach_out" text NOT NULL,
	"related_role_title" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people_watchlist" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"current_company" text,
	"why_watched" text,
	"source_url" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"provenance" text NOT NULL,
	"confidence" double precision,
	"source_ref" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_items" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"author" text NOT NULL,
	"author_headline" text,
	"excerpt" text NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"posted_at" text,
	"captured_at" text NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "raw_items_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "run_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" text NOT NULL,
	"finished_at" text,
	"summary" text,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"signals_found" integer DEFAULT 0 NOT NULL,
	"pings_sent" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_sources" (
	"signal_id" text NOT NULL,
	"source_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signal_sources_signal_id_source_item_id_pk" PRIMARY KEY("signal_id","source_item_id")
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"type" text NOT NULL,
	"direction" text NOT NULL,
	"strength" integer NOT NULL,
	"summary" text NOT NULL,
	"source_url" text,
	"excerpt" text,
	"observed_at" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_item_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_item_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "source_item_receipts_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "source_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid,
	"source_type" text NOT NULL,
	"external_id" text,
	"canonical_url" text,
	"content_hash" text NOT NULL,
	"title" text,
	"excerpt" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_roles" ADD CONSTRAINT "candidate_roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_roles" ADD CONSTRAINT "candidate_roles_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_profiles" ADD CONSTRAINT "career_profiles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_identities" ADD CONSTRAINT "channel_identities_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_aliases" ADD CONSTRAINT "company_aliases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_dossiers" ADD CONSTRAINT "company_dossiers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_deliveries" ADD CONSTRAINT "digest_deliveries_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_deliveries" ADD CONSTRAINT "digest_deliveries_discovery_run_id_discovery_runs_id_fk" FOREIGN KEY ("discovery_run_id") REFERENCES "public"."discovery_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_deliveries" ADD CONSTRAINT "digest_deliveries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_roles" ADD CONSTRAINT "open_roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_evidence" ADD CONSTRAINT "opportunity_evidence_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_evidence" ADD CONSTRAINT "opportunity_evidence_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_targets" ADD CONSTRAINT "outreach_targets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_sources" ADD CONSTRAINT "signal_sources_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_sources" ADD CONSTRAINT "signal_sources_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_item_receipts" ADD CONSTRAINT "source_item_receipts_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_sessions_surface_session" ON "agent_sessions" USING btree ("surface","eve_session_id");--> statement-breakpoint
CREATE INDEX "idx_agent_sessions_conversation_id" ON "agent_sessions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_roles_company_id" ON "candidate_roles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_roles_source_item_id" ON "candidate_roles" USING btree ("source_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_career_profiles_member_id" ON "career_profiles" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channel_identities_provider_user" ON "channel_identities" USING btree ("provider","external_user_id");--> statement-breakpoint
CREATE INDEX "idx_channel_identities_member_id" ON "channel_identities" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_companies_watchlist_tier" ON "companies" USING btree ("watchlist_tier");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_company_aliases_alias" ON "company_aliases" USING btree ("alias");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_company_dossiers_company_id" ON "company_dossiers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_connections_member_id" ON "connections" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_member_id" ON "conversations" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_digest_deliveries_member_id" ON "digest_deliveries" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_digest_deliveries_run_id" ON "digest_deliveries" USING btree ("discovery_run_id");--> statement-breakpoint
CREATE INDEX "idx_discovery_runs_status" ON "discovery_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_feedback_events_member_id" ON "feedback_events" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_members_external_auth_id" ON "members" USING btree ("external_auth_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_created" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_member_id" ON "messages" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_open_roles_company_id" ON "open_roles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_opportunities_member_id" ON "opportunities" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_opportunities_company_id" ON "opportunities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_opportunity_evidence_signal_id" ON "opportunity_evidence" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "idx_outreach_targets_company_id" ON "outreach_targets" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_preferences_member_key_provenance" ON "preferences" USING btree ("member_id","key","provenance");--> statement-breakpoint
CREATE INDEX "idx_preferences_member_id" ON "preferences" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_raw_items_processed" ON "raw_items" USING btree ("processed");--> statement-breakpoint
CREATE INDEX "idx_signal_sources_source_item" ON "signal_sources" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "idx_signals_company_id" ON "signals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_signals_observed_at" ON "signals" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "idx_source_item_receipts_item" ON "source_item_receipts" USING btree ("source_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_source_items_type_hash" ON "source_items" USING btree ("source_type","content_hash");--> statement-breakpoint
CREATE INDEX "idx_source_items_member_id" ON "source_items" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_source_items_processed_at" ON "source_items" USING btree ("processed_at");