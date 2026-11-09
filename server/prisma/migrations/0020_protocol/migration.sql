-- Slice 3.16: Protocol on the old team engine. Add-only and idempotent.

CREATE TABLE IF NOT EXISTS "ProtocolRoster" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "office" TEXT NOT NULL DEFAULT 'MEMBER',
    "serveDays" TEXT NOT NULL DEFAULT 'BOTH',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "unavailableJson" TEXT NOT NULL DEFAULT '[]',
    "allowedKindsJson" TEXT NOT NULL DEFAULT '[]',
    "onlyServicesJson" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProtocolRoster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProtocolRoster_personId_key" ON "ProtocolRoster"("personId");

CREATE TABLE IF NOT EXISTS "ProtocolPlan" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 0,
    "notesJson" TEXT NOT NULL DEFAULT '[]',
    "generatedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "musicVersionBuiltOn" INTEGER,
    "musicSnapshotJson" TEXT,
    "musicStaleNotified" BOOLEAN NOT NULL DEFAULT false,
    "overridesJson" TEXT NOT NULL DEFAULT '[]',
    "relaxTuesday" BOOLEAN NOT NULL DEFAULT false,
    "relaxReason" TEXT,
    "relaxedById" TEXT,
    "relaxedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProtocolPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProtocolPlan_monthKey_key" ON "ProtocolPlan"("monthKey");

CREATE TABLE IF NOT EXISTS "ProtocolSlot" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "recommendedRole" TEXT,
    "roleStatus" TEXT,
    "slotKind" TEXT NOT NULL DEFAULT 'REGULAR',
    "replacedPersonId" TEXT,
    CONSTRAINT "ProtocolSlot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProtocolSlot_monthKey_idx" ON "ProtocolSlot"("monthKey");

CREATE INDEX IF NOT EXISTS "ProtocolSlot_serviceId_idx" ON "ProtocolSlot"("serviceId");

CREATE TABLE IF NOT EXISTS "ProtocolHistory" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT NOT NULL,
    "slotsJson" TEXT NOT NULL,
    "notesJson" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "ProtocolHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProtocolHistory_monthKey_version_key" ON "ProtocolHistory"("monthKey","version");

CREATE TABLE IF NOT EXISTS "ProtocolAttendance" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "slotKind" TEXT,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProtocolAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProtocolAttendance_serviceId_personId_key" ON "ProtocolAttendance"("serviceId","personId");

CREATE TABLE IF NOT EXISTS "ProtocolAbsence" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "ProtocolAbsence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProtocolAbsence_serviceId_idx" ON "ProtocolAbsence"("serviceId");

CREATE TABLE IF NOT EXISTS "ProtocolFillIn" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "excusedPersonId" TEXT NOT NULL,
    "candidatePersonId" TEXT NOT NULL,
    "offeredById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    CONSTRAINT "ProtocolFillIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProtocolFillIn_serviceId_idx" ON "ProtocolFillIn"("serviceId");

CREATE TABLE IF NOT EXISTS "ProtocolSwapProposal" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    CONSTRAINT "ProtocolSwapProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProtocolSwapProposal_serviceId_idx" ON "ProtocolSwapProposal"("serviceId");

CREATE TABLE IF NOT EXISTS "ProtocolServiceReport" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "challenges" TEXT NOT NULL DEFAULT '',
    "solutions" TEXT NOT NULL DEFAULT '',
    "issues" TEXT NOT NULL DEFAULT '',
    "recommendations" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProtocolServiceReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProtocolServiceReport_serviceId_key" ON "ProtocolServiceReport"("serviceId");

CREATE INDEX IF NOT EXISTS "ProtocolServiceReport_monthKey_idx" ON "ProtocolServiceReport"("monthKey");
