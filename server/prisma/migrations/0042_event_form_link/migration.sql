-- 0042: an event may point its registration at an outside form (for example a Google Form).
-- Add-only and idempotent.
-- Rollback (manual): ALTER TABLE "WorkPlan" DROP COLUMN "registrationUrl";
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "registrationUrl" TEXT;
