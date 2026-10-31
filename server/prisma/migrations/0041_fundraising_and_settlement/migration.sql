-- 0041: fundraising events (target, revenue), the day an activity was marked Done, and its settlement.
-- Add-only and idempotent.
-- Rollback (manual): DROP TABLE "PlanRevenue"; ALTER TABLE "IncomeRecord" DROP COLUMN "planId";
--   ALTER TABLE "WorkPlan" DROP COLUMN "fundraising", DROP COLUMN "fundTarget", DROP COLUMN "doneAt", DROP COLUMN "settledAt", DROP COLUMN "settlementJson";
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "fundraising" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "fundTarget" INTEGER;
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "doneAt" TIMESTAMP(3);
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMP(3);
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "settlementJson" TEXT;
ALTER TABLE "IncomeRecord" ADD COLUMN IF NOT EXISTS "planId" TEXT;
CREATE TABLE IF NOT EXISTS "PlanRevenue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "receivedOn" TIMESTAMP(3) NOT NULL,
  "recordedById" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlanRevenue_planId_idx" ON "PlanRevenue"("planId");
