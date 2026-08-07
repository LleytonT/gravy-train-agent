DROP INDEX "uq_source_items_type_hash";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_source_items_member_type_hash" ON "source_items" USING btree ("member_id","source_type","content_hash");