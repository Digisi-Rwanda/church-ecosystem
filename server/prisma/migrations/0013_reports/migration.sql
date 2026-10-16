-- Slice 3.5: Reports (frozen when published) and monthly report schedules. Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "Report" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "snapshotJson" TEXT NOT NULL DEFAULT '{}',
    "composedById" TEXT NOT NULL,
    "composedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Report_systemId_status_idx" ON "Report"("systemId", "status");
CREATE INDEX IF NOT EXISTS "Report_orgUnitId_kind_periodKey_idx" ON "Report"("orgUnitId", "kind", "periodKey");

CREATE TABLE IF NOT EXISTS "ReportSchedule" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReportSchedule_systemId_active_idx" ON "ReportSchedule"("systemId", "active");
