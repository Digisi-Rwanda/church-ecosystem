CREATE TABLE IF NOT EXISTS "ProgramYear" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 0,
  "spent" INTEGER,
  "returned" INTEGER,
  "attendance" INTEGER,
  "decision" TEXT,
  "note" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "fundedById" TEXT,
  "fundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgramYear_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProgramYear_planId_year_key" ON "ProgramYear"("planId", "year");
CREATE INDEX IF NOT EXISTS "ProgramYear_planId_idx" ON "ProgramYear"("planId");
CREATE INDEX IF NOT EXISTS "ProgramYear_systemId_idx" ON "ProgramYear"("systemId");
