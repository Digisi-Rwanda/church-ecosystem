-- Slice 3.6: Person 360 records with full history. Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "PersonRecord" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'CURRENT',
    "supersedesId" TEXT,
    "programId" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidReason" TEXT,
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    CONSTRAINT "PersonRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PersonRecord_personId_section_status_idx" ON "PersonRecord"("personId", "section", "status");
CREATE INDEX IF NOT EXISTS "PersonRecord_programId_idx" ON "PersonRecord"("programId");
