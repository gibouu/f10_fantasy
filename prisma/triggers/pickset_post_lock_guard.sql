-- PickSet post-lock guard
--
-- Once a PickSet has lockedAt set, the live driver/seat fields cannot be
-- changed. Any UPDATE that tries to mutate them on a locked row is refused
-- by the database. This is redundancy layer 3:
--   L1 (app):    pick.service.ts atomic guard rejects writes at the API.
--   L2 (data):   scoring.service.ts reads lockedTenthPlaceDriverId etc., so
--                even if a write somehow lands the score uses the snapshot.
--   L3 (DB):    THIS TRIGGER refuses post-lock driver/seat writes server-side
--                regardless of which client (Prisma, psql, scripts) tried it.
--
-- Allowed post-lock UPDATEs:
--   * unlocking the row (lockedAt → NULL)
--   * touching ScoreBreakdown / scoreBreakdown is a separate table, untouched
--   * any update that does not change driver/seat fields
--
-- Idempotent: re-running this script drops and recreates the trigger.

CREATE OR REPLACE FUNCTION prevent_post_lock_pickset_edit()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."lockedAt" IS NOT NULL AND (
       NEW."tenthPlaceDriverId" IS DISTINCT FROM OLD."tenthPlaceDriverId" OR
       NEW."winnerDriverId"     IS DISTINCT FROM OLD."winnerDriverId"     OR
       NEW."dnfDriverId"        IS DISTINCT FROM OLD."dnfDriverId"        OR
       NEW."tenthPlaceSeatKey"  IS DISTINCT FROM OLD."tenthPlaceSeatKey"  OR
       NEW."winnerSeatKey"      IS DISTINCT FROM OLD."winnerSeatKey"      OR
       NEW."dnfSeatKey"         IS DISTINCT FROM OLD."dnfSeatKey"
     ) THEN
    RAISE EXCEPTION
      'PickSet % is locked (lockedAt=%); driver/seat fields cannot be modified',
      OLD.id, OLD."lockedAt"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pickset_post_lock_guard ON "PickSet";

CREATE TRIGGER pickset_post_lock_guard
  BEFORE UPDATE ON "PickSet"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_post_lock_pickset_edit();
