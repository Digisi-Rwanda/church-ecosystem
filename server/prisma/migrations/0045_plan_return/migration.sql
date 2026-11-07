-- 0045: where a plan was sent back to its creator, so that a text-only fix resumes at the same step. Add-only and idempotent.
-- Rollback (manual): ALTER TABLE "WorkPlan" DROP COLUMN "returnJson";
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "returnJson" TEXT;
