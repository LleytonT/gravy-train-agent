CREATE TABLE "inbound_quarantine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid,
	"provider" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"reason" text NOT NULL,
	"recipient_address" text,
	"subject" text,
	"excerpt" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_quarantine_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "inbound_quarantine" ADD CONSTRAINT "inbound_quarantine_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inbound_quarantine_member_id" ON "inbound_quarantine" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_inbound_quarantine_created_at" ON "inbound_quarantine" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_connections_active_inbound_address" ON "connections" USING btree ("provider","external_account_id") WHERE "connections"."provider" = 'inbound_email' AND "connections"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_connections_member_active_inbound" ON "connections" USING btree ("member_id") WHERE "connections"."provider" = 'inbound_email' AND "connections"."status" = 'active';