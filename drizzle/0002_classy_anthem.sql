ALTER TABLE "agent_sessions" DROP CONSTRAINT "agent_sessions_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "digest_deliveries" DROP CONSTRAINT "digest_deliveries_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_conversation_id_conversations_id_fk";
--> statement-breakpoint
DROP INDEX "uq_source_items_member_type_hash";--> statement-breakpoint
ALTER TABLE "candidate_roles" ADD COLUMN "member_id" uuid;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "member_id" uuid;--> statement-breakpoint
ALTER TABLE "source_items" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
UPDATE "source_items" SET "visibility" = 'member' WHERE "member_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_conversations_id_member" ON "conversations" USING btree ("id","member_id");--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "fk_agent_sessions_conversation_member" FOREIGN KEY ("conversation_id","member_id") REFERENCES "public"."conversations"("id","member_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_roles" ADD CONSTRAINT "candidate_roles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_deliveries" ADD CONSTRAINT "fk_digest_deliveries_conversation_member" FOREIGN KEY ("conversation_id","member_id") REFERENCES "public"."conversations"("id","member_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_conversation_member" FOREIGN KEY ("conversation_id","member_id") REFERENCES "public"."conversations"("id","member_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_candidate_roles_member_id" ON "candidate_roles" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_signals_member_id" ON "signals" USING btree ("member_id");--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "uq_source_items_member_type_hash" UNIQUE NULLS NOT DISTINCT("member_id","source_type","content_hash");--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "chk_source_items_member_visibility" CHECK ("source_items"."visibility" = 'public' OR "source_items"."member_id" IS NOT NULL);