-- Slice 5.1: a unit sends its approved budget to Central as a frozen report. Add-only and idempotent. Rollback: DROP TABLE "MoneyBudgetSubmission";
CREATE TABLE IF NOT EXISTS "MoneyBudgetSubmission" (
  "id" TEXT NOT NULL, "systemId" TEXT NOT NULL, "year" INTEGER NOT NULL, "snapshotJson" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL, "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MoneyBudgetSubmission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MoneyBudgetSubmission_systemId_year_idx" ON "MoneyBudgetSubmission"("systemId", "year");
