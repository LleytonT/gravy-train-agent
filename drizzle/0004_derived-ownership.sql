CREATE OR REPLACE FUNCTION enforce_signal_member_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "signal_sources" ss
      JOIN "source_items" si ON si."id" = ss."source_item_id"
     WHERE ss."signal_id" = NEW."id"
       AND si."visibility" = 'member'
       AND NEW."member_id" IS DISTINCT FROM si."member_id"
  ) OR EXISTS (
    SELECT 1
      FROM "opportunity_evidence" oe
      JOIN "opportunities" o ON o."id" = oe."opportunity_id"
     WHERE oe."signal_id" = NEW."id"
       AND NEW."member_id" IS NOT NULL
       AND NEW."member_id" IS DISTINCT FROM o."member_id"
  ) THEN
    RAISE EXCEPTION 'signal member conflicts with existing private evidence'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "trg_signal_member_change"
BEFORE UPDATE OF "member_id" ON "signals"
FOR EACH ROW
EXECUTE FUNCTION enforce_signal_member_change();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_opportunity_evidence_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  opportunity_member_id uuid;
  signal_member_id uuid;
BEGIN
  SELECT "member_id"
    INTO opportunity_member_id
    FROM "opportunities"
   WHERE "id" = NEW."opportunity_id";

  SELECT "member_id"
    INTO signal_member_id
    FROM "signals"
   WHERE "id" = NEW."signal_id";

  IF signal_member_id IS NOT NULL
     AND opportunity_member_id IS DISTINCT FROM signal_member_id THEN
    RAISE EXCEPTION 'member opportunity cannot cite another member signal'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "trg_opportunity_evidence_ownership"
BEFORE INSERT OR UPDATE ON "opportunity_evidence"
FOR EACH ROW
EXECUTE FUNCTION enforce_opportunity_evidence_ownership();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_opportunity_member_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "opportunity_evidence" oe
      JOIN "signals" s ON s."id" = oe."signal_id"
     WHERE oe."opportunity_id" = NEW."id"
       AND s."member_id" IS NOT NULL
       AND NEW."member_id" IS DISTINCT FROM s."member_id"
  ) THEN
    RAISE EXCEPTION 'opportunity member conflicts with existing evidence'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "trg_opportunity_member_change"
BEFORE UPDATE OF "member_id" ON "opportunities"
FOR EACH ROW
EXECUTE FUNCTION enforce_opportunity_member_change();