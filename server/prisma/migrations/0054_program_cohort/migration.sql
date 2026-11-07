CREATE TABLE IF NOT EXISTS "ProgramCohort" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsOn" TIMESTAMP(3) NOT NULL,
  "endsOn" TIMESTAMP(3) NOT NULL,
  "target" INTEGER,
  "enrolled" INTEGER NOT NULL DEFAULT 0,
  "graduated" INTEGER,
  "budget" INTEGER NOT NULL DEFAULT 0,
  "spent" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "closedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgramCohort_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProgramCohort_planId_idx" ON "ProgramCohort"("planId");
CREATE INDEX IF NOT EXISTS "ProgramCohort_systemId_idx" ON "ProgramCohort"("systemId");
