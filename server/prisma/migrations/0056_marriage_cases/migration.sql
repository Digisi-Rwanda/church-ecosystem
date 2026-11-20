ALTER TABLE "ProgramCase" ADD COLUMN IF NOT EXISTS "detailsJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ProgramCase" ADD COLUMN IF NOT EXISTS "verifiedById" TEXT;
ALTER TABLE "ProgramCase" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "ProgramCase" ADD COLUMN IF NOT EXISTS "changeJson" TEXT;
CREATE TABLE IF NOT EXISTS "ProgramCaseItem" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "place" TEXT NOT NULL DEFAULT '',
  "onDate" TIMESTAMP(3) NOT NULL,
  "atTime" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgramCaseItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProgramCaseItem_caseId_idx" ON "ProgramCaseItem"("caseId");
CREATE INDEX IF NOT EXISTS "ProgramCaseItem_planId_idx" ON "ProgramCaseItem"("planId");
