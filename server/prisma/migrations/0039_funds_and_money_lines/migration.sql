-- 0039: income with a promised or received status, money set aside for activities, and the Treasurer's check of an
-- activity's spending lines. Add-only and idempotent.
-- Rollback (manual): DROP TABLE "PlanSource"; DROP TABLE "IncomeRecord";
--   ALTER TABLE "MoneyPlanItem" DROP COLUMN "checkState", DROP COLUMN "checkedById", DROP COLUMN "checkedAt";
--   ALTER TABLE "WorkPlan" DROP COLUMN "moneyCheckJson";
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "moneyCheckJson" TEXT;
ALTER TABLE "MoneyPlanItem" ADD COLUMN IF NOT EXISTS "checkState" TEXT;
ALTER TABLE "MoneyPlanItem" ADD COLUMN IF NOT EXISTS "checkedById" TEXT;
ALTER TABLE "MoneyPlanItem" ADD COLUMN IF NOT EXISTS "checkedAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "IncomeRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "systemId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL DEFAULT '',
  "label" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "expectedOn" TIMESTAMP(3),
  "receivedOn" TIMESTAMP(3),
  "note" TEXT,
  "recordedById" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IncomeRecord_systemId_status_idx" ON "IncomeRecord"("systemId", "status");
CREATE TABLE IF NOT EXISTS "PlanSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL DEFAULT '',
  "amount" INTEGER NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlanSource_planId_kind_code_key" ON "PlanSource"("planId", "kind", "code");
CREATE INDEX IF NOT EXISTS "PlanSource_planId_idx" ON "PlanSource"("planId");
CREATE INDEX IF NOT EXISTS "PlanSource_systemId_idx" ON "PlanSource"("systemId");
