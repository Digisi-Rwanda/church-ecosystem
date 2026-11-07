-- What was given at one church service or event. Add-only and safe to run twice.
CREATE TABLE IF NOT EXISTS "ServiceCollection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "systemId" TEXT NOT NULL DEFAULT 'sys-main',
  "kind" TEXT NOT NULL DEFAULT 'SERVICE',
  "title" TEXT NOT NULL,
  "heldOn" TIMESTAMP(3) NOT NULL,
  "startsAt" TEXT,
  "tithe" INTEGER NOT NULL DEFAULT 0,
  "offering" INTEGER NOT NULL DEFAULT 0,
  "other" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "voidReason" TEXT,
  "recordedById" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ServiceCollection_systemId_heldOn_idx" ON "ServiceCollection"("systemId", "heldOn");
-- Rollback: DROP TABLE "ServiceCollection";
