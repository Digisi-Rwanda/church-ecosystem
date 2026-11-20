-- Slices 2.1 and 2.2: settings, meetings and the decision register. Add-only and safe to re-run.
CREATE TABLE IF NOT EXISTS "Setting" (
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "Meeting" (
    "id" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "agenda" TEXT,
    "minutes" TEXT,
    "attendeesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heldAt" TIMESTAMP(3),
    "heldById" TEXT,
    "cancelledReason" TEXT,
    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Meeting_systemId_scheduledAt_idx" ON "Meeting"("systemId", "scheduledAt");

CREATE TABLE IF NOT EXISTS "Decision" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT,
    "orgUnitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "rejectReason" TEXT,
    "withdrawnReason" TEXT,
    "ownerPersonId" TEXT,
    "dueDate" TIMESTAMP(3),
    "taskId" TEXT,
    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Decision_systemId_createdAt_idx" ON "Decision"("systemId", "createdAt");
