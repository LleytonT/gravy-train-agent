UPDATE "source_items"
SET "visibility" = 'member'
WHERE "member_id" IS NOT NULL
  AND "visibility" = 'public';
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_signal_source_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  derived_member_id uuid;
  source_member_id uuid;
  source_visibility text;
BEGIN
  SELECT "member_id"
    INTO derived_member_id
    FROM "signals"
   WHERE "id" = NEW."signal_id";

  SELECT "member_id", "visibility"
    INTO source_member_id, source_visibility
    FROM "source_items"
   WHERE "id" = NEW."source_item_id";

  IF source_visibility = 'member'
     AND derived_member_id IS DISTINCT FROM source_member_id THEN
    RAISE EXCEPTION 'private source item and signal must have the same member'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "trg_signal_source_ownership"
BEFORE INSERT OR UPDATE ON "signal_sources"
FOR EACH ROW
EXECUTE FUNCTION enforce_signal_source_ownership();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_candidate_role_source_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_member_id uuid;
  source_visibility text;
BEGIN
  IF NEW."source_item_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "member_id", "visibility"
    INTO source_member_id, source_visibility
    FROM "source_items"
   WHERE "id" = NEW."source_item_id";

  IF source_visibility = 'member'
     AND NEW."member_id" IS DISTINCT FROM source_member_id THEN
    RAISE EXCEPTION 'private source item and candidate role must have the same member'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "trg_candidate_role_source_ownership"
BEFORE INSERT OR UPDATE OF "source_item_id", "member_id" ON "candidate_roles"
FOR EACH ROW
EXECUTE FUNCTION enforce_candidate_role_source_ownership();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_source_item_visibility_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."visibility" = 'member' AND (
    EXISTS (
      SELECT 1
        FROM "signal_sources" ss
        JOIN "signals" s ON s."id" = ss."signal_id"
       WHERE ss."source_item_id" = NEW."id"
         AND s."member_id" IS DISTINCT FROM NEW."member_id"
    )
    OR EXISTS (
      SELECT 1
        FROM "candidate_roles" cr
       WHERE cr."source_item_id" = NEW."id"
         AND cr."member_id" IS DISTINCT FROM NEW."member_id"
    )
  ) THEN
    RAISE EXCEPTION 'private source item ownership conflicts with derived records'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "trg_source_item_visibility_change"
BEFORE UPDATE OF "visibility", "member_id" ON "source_items"
FOR EACH ROW
EXECUTE FUNCTION enforce_source_item_visibility_change();