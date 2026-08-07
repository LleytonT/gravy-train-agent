ALTER TABLE "opportunities" ADD COLUMN "candidate_role_id" uuid;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "score_version" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "score_inputs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "rationale" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "material_hash" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_candidate_role_id_candidate_roles_id_fk" FOREIGN KEY ("candidate_role_id") REFERENCES "public"."candidate_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_opportunities_candidate_role_id" ON "opportunities" USING btree ("candidate_role_id");
