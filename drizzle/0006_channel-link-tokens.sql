CREATE TABLE "channel_link_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_external_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_link_tokens" ADD CONSTRAINT "channel_link_tokens_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channel_link_tokens_hash" ON "channel_link_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "idx_channel_link_tokens_member_id" ON "channel_link_tokens" USING btree ("member_id");
--> statement-breakpoint
CREATE INDEX "idx_channel_link_tokens_expires_at" ON "channel_link_tokens" USING btree ("expires_at");
