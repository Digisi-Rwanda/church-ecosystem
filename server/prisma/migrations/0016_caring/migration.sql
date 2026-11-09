-- Slice 3.9: couples pairs, elderly visit log, prayer watches. Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "CouplePair" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "personAId" TEXT NOT NULL,
    "personBId" TEXT NOT NULL,
    "marriedOn" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CouplePair_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CouplePair_systemId_status_idx" ON "CouplePair"("systemId", "status");

CREATE TABLE IF NOT EXISTS "VisitLog" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "elderPersonId" TEXT NOT NULL,
    "visitedOn" TIMESTAMP(3) NOT NULL,
    "visitorsJson" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisitLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VisitLog_systemId_visitedOn_idx" ON "VisitLog"("systemId", "visitedOn");
CREATE INDEX IF NOT EXISTS "VisitLog_elderPersonId_idx" ON "VisitLog"("elderPersonId");

CREATE TABLE IF NOT EXISTS "PrayerWatch" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrayerWatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PrayerWatch_systemId_status_idx" ON "PrayerWatch"("systemId", "status");

CREATE TABLE IF NOT EXISTS "PrayerWatchMember" (
    "id" TEXT NOT NULL,
    "watchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "PrayerWatchMember_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PrayerWatchMember_watchId_status_idx" ON "PrayerWatchMember"("watchId", "status");
