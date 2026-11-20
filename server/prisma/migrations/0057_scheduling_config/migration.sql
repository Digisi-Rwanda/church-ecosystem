-- Slice 3.17: Configurable Music & Protocol scheduling configuration.
-- Add-only and idempotent: creates new versioned config tables and adds the
-- configVersionId reference column to MusicMonth and ProtocolPlan. No existing
-- table, column, row or identifier is altered or removed.
--
-- Notes:
--  * Every config table is tenant-scoped by systemId and versioned through
--    effectiveFrom / effectiveTo / status / supersedesId. Edits supersede the
--    prior row instead of overwriting it, so history is preserved.
--  * service code (SchedulingService.code) is the stable identity referenced
--    by generated msvc-<date>-<code> ids and by Protocol; it never changes once
--    in use. Deactivation sets active = false / effectiveTo but keeps the row.
--  * configVersionId is a plain TEXT column (FK enforced by the Prisma schema
--    / application layer, not by the database, so the same SQL runs on SQLite
--    and PostgreSQL). MusicMonth and ProtocolPlan record the config version
--    used to generate/validate them, keeping published schedules reproducible.

CREATE TABLE IF NOT EXISTS "ConfigVersion" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdByPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "previousVersionId" TEXT,
    "notesJson" TEXT NOT NULL DEFAULT '{}',
    "validationJson" TEXT NOT NULL DEFAULT '{}',
    "affectedSchedulesJson" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "ConfigVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConfigVersion_systemId_version_key" ON "ConfigVersion"("systemId", "version");
CREATE INDEX IF NOT EXISTS "ConfigVersion_systemId_status_idx" ON "ConfigVersion"("systemId", "status");

CREATE TABLE IF NOT EXISTS "SchedulingService" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SERVICE',
    "weekday" INTEGER,
    "time" TEXT,
    "recurrence" TEXT NOT NULL DEFAULT 'WEEKLY',
    "selectedDatesJson" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "musicRequired" BOOLEAN NOT NULL DEFAULT false,
    "protocolRequired" BOOLEAN NOT NULL DEFAULT false,
    "maxChoirs" INTEGER NOT NULL DEFAULT 3,
    "targetTeamSize" INTEGER NOT NULL DEFAULT 10,
    "configVersionId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "supersedesId" TEXT,
    "createdByPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchedulingService_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SchedulingService_systemId_code_key" ON "SchedulingService"("systemId", "code");
CREATE INDEX IF NOT EXISTS "SchedulingService_systemId_active_idx" ON "SchedulingService"("systemId", "active");
CREATE INDEX IF NOT EXISTS "SchedulingService_configVersionId_idx" ON "SchedulingService"("configVersionId");

CREATE TABLE IF NOT EXISTS "ChoirCategory" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "configVersionId" TEXT,
    "supersedesId" TEXT,
    "createdByPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChoirCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChoirCategory_systemId_code_key" ON "ChoirCategory"("systemId", "code");
CREATE INDEX IF NOT EXISTS "ChoirCategory_systemId_active_idx" ON "ChoirCategory"("systemId", "active");
CREATE INDEX IF NOT EXISTS "ChoirCategory_configVersionId_idx" ON "ChoirCategory"("configVersionId");

CREATE TABLE IF NOT EXISTS "CategoryServicePolicy" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "frequencyTarget" INTEGER,
    "frequencyCounting" TEXT NOT NULL DEFAULT 'ASSIGNMENTS',
    "frequencyKind" TEXT NOT NULL DEFAULT 'TARGET',
    "planningMode" TEXT NOT NULL DEFAULT 'ROTATION',
    "minCount" INTEGER,
    "maxCount" INTEGER,
    "requireAll" BOOLEAN NOT NULL DEFAULT false,
    "configVersionId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "supersedesId" TEXT,
    "createdByPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoryServicePolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CategoryServicePolicy_systemId_categoryId_serviceId_key" ON "CategoryServicePolicy"("systemId", "categoryId", "serviceId");
CREATE INDEX IF NOT EXISTS "CategoryServicePolicy_systemId_categoryId_idx" ON "CategoryServicePolicy"("systemId", "categoryId");
CREATE INDEX IF NOT EXISTS "CategoryServicePolicy_configVersionId_idx" ON "CategoryServicePolicy"("configVersionId");

CREATE TABLE IF NOT EXISTS "ChoirCategoryLink" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "choirId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "eligibleOverrideJson" TEXT NOT NULL DEFAULT '{}',
    "frequencyOverrideJson" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "configVersionId" TEXT,
    "supersedesId" TEXT,
    "createdByPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChoirCategoryLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChoirCategoryLink_systemId_choirId_key" ON "ChoirCategoryLink"("systemId", "choirId");
CREATE INDEX IF NOT EXISTS "ChoirCategoryLink_systemId_categoryId_idx" ON "ChoirCategoryLink"("systemId", "categoryId");
CREATE INDEX IF NOT EXISTS "ChoirCategoryLink_configVersionId_idx" ON "ChoirCategoryLink"("configVersionId");

CREATE TABLE IF NOT EXISTS "ProtocolServiceRule" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "defaultTeamSize" INTEGER NOT NULL DEFAULT 10,
    "teamSizeOverridesJson" TEXT NOT NULL DEFAULT '{}',
    "requireChoir" BOOLEAN NOT NULL DEFAULT true,
    "requireWorship" BOOLEAN NOT NULL DEFAULT true,
    "relaxableKindsJson" TEXT NOT NULL DEFAULT '[]',
    "configVersionId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "supersedesId" TEXT,
    "createdByPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProtocolServiceRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProtocolServiceRule_systemId_serviceId_key" ON "ProtocolServiceRule"("systemId", "serviceId");
CREATE INDEX IF NOT EXISTS "ProtocolServiceRule_systemId_serviceId_idx" ON "ProtocolServiceRule"("systemId", "serviceId");
CREATE INDEX IF NOT EXISTS "ProtocolServiceRule_configVersionId_idx" ON "ProtocolServiceRule"("configVersionId");

CREATE TABLE IF NOT EXISTS "ProtocolDutyPolicy" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "preferTarget" INTEGER NOT NULL DEFAULT 3,
    "softMax" INTEGER NOT NULL DEFAULT 3,
    "hardMax" INTEGER NOT NULL DEFAULT 4,
    "extraDutyPolicy" TEXT NOT NULL DEFAULT 'ALLOW_WHEN_SHORT',
    "duplicateSameDayAllowed" BOOLEAN NOT NULL DEFAULT false,
    "musicCompatibilityRequired" BOOLEAN NOT NULL DEFAULT true,
    "leadershipPrioritiesJson" TEXT NOT NULL DEFAULT '[]',
    "exceptionsAllowed" BOOLEAN NOT NULL DEFAULT true,
    "configVersionId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "supersedesId" TEXT,
    "createdByPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProtocolDutyPolicy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProtocolDutyPolicy_systemId_idx" ON "ProtocolDutyPolicy"("systemId");
CREATE INDEX IF NOT EXISTS "ProtocolDutyPolicy_configVersionId_idx" ON "ProtocolDutyPolicy"("configVersionId");

-- Reference the config version used to generate / validate each schedule.
-- SQLite: plain ADD COLUMN (db push applies the full schema anyway).
-- PostgreSQL: ADD COLUMN IF NOT EXISTS is idempotent on re-run.
ALTER TABLE "MusicMonth" ADD COLUMN IF NOT EXISTS "configVersionId" TEXT;
ALTER TABLE "ProtocolPlan" ADD COLUMN IF NOT EXISTS "configVersionId" TEXT;
