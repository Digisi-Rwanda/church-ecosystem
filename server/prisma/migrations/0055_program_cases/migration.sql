CREATE TABLE IF NOT EXISTS "ProgramCase" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "caseType" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contact" TEXT NOT NULL DEFAULT '',
  "issue" TEXT NOT NULL DEFAULT '',
  "capacity" INTEGER NOT NULL DEFAULT 0,
  "need" INTEGER NOT NULL DEFAULT 0,
  "gap" INTEGER NOT NULL DEFAULT 0,
  "approved" INTEGER NOT NULL DEFAULT 0,
  "disbursed" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "condition" TEXT,
  "batchId" TEXT,
  "outcome" TEXT,
  "closeNote" TEXT,
  "registeredById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "ProgramCase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProgramCase_planId_idx" ON "ProgramCase"("planId");
CREATE INDEX IF NOT EXISTS "ProgramCase_systemId_idx" ON "ProgramCase"("systemId");
CREATE TABLE IF NOT EXISTS "ProgramCaseBatch" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "decidedById" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidEntryId" TEXT,
  "paidById" TEXT,
  "paidAt" TIMESTAMP(3),
  CONSTRAINT "ProgramCaseBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProgramCaseBatch_planId_idx" ON "ProgramCaseBatch"("planId");
CREATE TABLE IF NOT EXISTS "ProgramCaseEvent" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "byId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgramCaseEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProgramCaseEvent_caseId_idx" ON "ProgramCaseEvent"("caseId");
CREATE INDEX IF NOT EXISTS "ProgramCaseEvent_planId_idx" ON "ProgramCaseEvent"("planId");
