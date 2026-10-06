-- Slice 1.3: delegation of letters. Add-only and safe to re-run.
CREATE TABLE IF NOT EXISTS "Delegation" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "fromPersonId" TEXT NOT NULL,
    "toPersonId" TEXT NOT NULL,
    "lettersJson" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Delegation_toPersonId_status_idx" ON "Delegation"("toPersonId", "status");
CREATE INDEX IF NOT EXISTS "Delegation_positionId_idx" ON "Delegation"("positionId");
