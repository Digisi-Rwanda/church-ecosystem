-- 0038: how an activity says when it happens (a date, a range or a repeat), its times, the last date change, and the
-- six-month postponement flag. Add-only and idempotent.
-- Rollback (manual): ALTER TABLE "WorkPlan" DROP COLUMN "timingKind", DROP COLUMN "startTime", DROP COLUMN "endTime",
--   DROP COLUMN "repeatJson", DROP COLUMN "dateChangeJson", DROP COLUMN "reviewDue";
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "timingKind" TEXT NOT NULL DEFAULT 'RANGE';
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "startTime" TEXT;
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "endTime" TEXT;
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "repeatJson" TEXT;
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "dateChangeJson" TEXT;
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "reviewDue" BOOLEAN NOT NULL DEFAULT false;
