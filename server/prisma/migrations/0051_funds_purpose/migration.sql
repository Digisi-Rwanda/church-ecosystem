ALTER TABLE "IncomeRecord" ADD COLUMN IF NOT EXISTS "sourceTag" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "IncomeRecord" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "IncomeRecord" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "ContributionList" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Donation" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS "FundAdjustment" (
  "id" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "planId" TEXT,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL DEFAULT '',
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FundAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FundAdjustment_systemId_idx" ON "FundAdjustment"("systemId");
CREATE INDEX IF NOT EXISTS "FundAdjustment_planId_idx" ON "FundAdjustment"("planId");
