-- 0031: activities carry their funding source; budget submissions carry the Church Leader's decision.
-- Add-only and idempotent. Rollback (manual): drop the added columns.
ALTER TABLE "MoneyPlanItem" ADD COLUMN IF NOT EXISTS "planId" TEXT;
ALTER TABLE "MoneyPlanItem" ADD COLUMN IF NOT EXISTS "fundingKind" TEXT;
ALTER TABLE "MoneyPlanItem" ADD COLUMN IF NOT EXISTS "fundingCode" TEXT;
ALTER TABLE "MoneyPlanItem" ADD COLUMN IF NOT EXISTS "fundingNote" TEXT;
CREATE INDEX IF NOT EXISTS "MoneyPlanItem_planId_idx" ON "MoneyPlanItem"("planId");
ALTER TABLE "MoneyEntry" ADD COLUMN IF NOT EXISTS "planId" TEXT;
CREATE INDEX IF NOT EXISTS "MoneyEntry_planId_idx" ON "MoneyEntry"("planId");
ALTER TABLE "MoneyBudgetSubmission" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'SUBMITTED';
ALTER TABLE "MoneyBudgetSubmission" ADD COLUMN IF NOT EXISTS "decidedById" TEXT;
ALTER TABLE "MoneyBudgetSubmission" ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3);
ALTER TABLE "MoneyBudgetSubmission" ADD COLUMN IF NOT EXISTS "decisionNote" TEXT;
