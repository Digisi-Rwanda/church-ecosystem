-- Slice 3.1: month plans, slots and assignments. Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "MonthPlan" (
    "id" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "MonthPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MonthPlan_systemId_month_idx" ON "MonthPlan"("systemId", "month");

CREATE TABLE IF NOT EXISTS "ScheduleSlot" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "notes" TEXT,
    "churchWide" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleSlot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ScheduleSlot_planId_idx" ON "ScheduleSlot"("planId");
CREATE INDEX IF NOT EXISTS "ScheduleSlot_systemId_startsAt_idx" ON "ScheduleSlot"("systemId", "startsAt");

CREATE TABLE IF NOT EXISTS "SlotAssignment" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "declineReason" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SlotAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SlotAssignment_slotId_idx" ON "SlotAssignment"("slotId");
CREATE INDEX IF NOT EXISTS "SlotAssignment_personId_idx" ON "SlotAssignment"("personId");
