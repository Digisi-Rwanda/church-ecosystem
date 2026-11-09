-- Slice 3.3: Full work (plans with approval, execution notes, checklist, frozen report). Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "WorkPlan" (
    "id" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "aim" TEXT NOT NULL DEFAULT '',
    "needs" TEXT,
    "location" TEXT,
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "leaderPersonId" TEXT NOT NULL,
    "teamJson" TEXT NOT NULL DEFAULT '[]',
    "beyondUnit" BOOLEAN NOT NULL DEFAULT false,
    "visibility" TEXT NOT NULL DEFAULT 'SYSTEM',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalsJson" TEXT NOT NULL DEFAULT '[]',
    "rejectedReason" TEXT,
    "cancelReason" TEXT,
    "planningSummary" TEXT,
    "executionSummary" TEXT,
    "outcome" TEXT,
    "reportComposedById" TEXT,
    "reportComposedAt" TIMESTAMP(3),
    "reportPublishedById" TEXT,
    "reportPublishedAt" TIMESTAMP(3),
    "reportJson" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    CONSTRAINT "WorkPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkPlan_systemId_status_idx" ON "WorkPlan"("systemId", "status");
CREATE INDEX IF NOT EXISTS "WorkPlan_leaderPersonId_idx" ON "WorkPlan"("leaderPersonId");

CREATE TABLE IF NOT EXISTS "WorkPlanNote" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkPlanNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkPlanNote_planId_idx" ON "WorkPlanNote"("planId");

CREATE TABLE IF NOT EXISTS "WorkPlanCheck" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneById" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkPlanCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkPlanCheck_planId_idx" ON "WorkPlanCheck"("planId");
