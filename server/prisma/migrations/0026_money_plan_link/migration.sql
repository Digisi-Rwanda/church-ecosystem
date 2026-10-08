-- Slice 3.20: money linked to programs, projects and events. Add-only and idempotent.
ALTER TABLE "MoneyEntry" ADD COLUMN IF NOT EXISTS "planId" TEXT;
ALTER TABLE "MoneyPlanItem" ADD COLUMN IF NOT EXISTS "planId" TEXT;
CREATE INDEX IF NOT EXISTS "MoneyEntry_planId_idx" ON "MoneyEntry"("planId");
CREATE INDEX IF NOT EXISTS "MoneyPlanItem_planId_idx" ON "MoneyPlanItem"("planId");
