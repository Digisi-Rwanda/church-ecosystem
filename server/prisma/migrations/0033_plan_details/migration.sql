-- 0033: a plan keeps the answers of its named screens (Define the event, Plan the event) as JSON text.
-- Add-only and idempotent. Rollback (manual): ALTER TABLE "WorkPlan" DROP COLUMN "detailsJson";
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "detailsJson" TEXT NOT NULL DEFAULT '{}';
