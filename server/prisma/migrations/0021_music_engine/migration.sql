-- Slice 3.16: Music schedule engine documents (drafts, confirmed/published months, change log). Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "MusicDraft" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "horizon" TEXT NOT NULL,
    "startMonth" TEXT NOT NULL,
    "servicesJson" TEXT NOT NULL,
    "assignmentsJson" TEXT NOT NULL,
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MusicDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MusicMonth" (
    "id" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "batchId" TEXT,
    "batchHorizon" TEXT,
    "servicesJson" TEXT NOT NULL,
    "assignmentsJson" TEXT NOT NULL,
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "MusicMonth_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MusicMonth_periodKey_key" ON "MusicMonth"("periodKey");

CREATE TABLE IF NOT EXISTS "MusicLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodKey" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "byId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "changesJson" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "MusicLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MusicLog_periodKey_idx" ON "MusicLog"("periodKey");
