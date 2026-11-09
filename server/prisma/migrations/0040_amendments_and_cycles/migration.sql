-- 0040: budget amendments to approved activities, budget cycles for repeats, and the monthly release of ongoing programs.
-- Add-only and idempotent.
-- Rollback (manual): DROP TABLE "PlanRenewal"; DROP TABLE "BudgetAmendment";
--   ALTER TABLE "WorkPlan" DROP COLUMN "budgetCycle", DROP COLUMN "budgetCycles";
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "budgetCycle" TEXT;
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "budgetCycles" INTEGER;
CREATE TABLE IF NOT EXISTS "BudgetAmendment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "oldTotal" INTEGER NOT NULL,
  "newTotal" INTEGER NOT NULL,
  "justification" TEXT NOT NULL,
  "linesJson" TEXT NOT NULL,
  "sourcesJson" TEXT NOT NULL,
  "reserveJson" TEXT NOT NULL DEFAULT '[]',
  "requestedById" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "BudgetAmendment_planId_idx" ON "BudgetAmendment"("planId");
CREATE INDEX IF NOT EXISTS "BudgetAmendment_systemId_status_idx" ON "BudgetAmendment"("systemId", "status");
CREATE TABLE IF NOT EXISTS "PlanRenewal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "renewedById" TEXT NOT NULL,
  "renewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlanRenewal_planId_month_key" ON "PlanRenewal"("planId", "month");
CREATE INDEX IF NOT EXISTS "PlanRenewal_planId_idx" ON "PlanRenewal"("planId");
