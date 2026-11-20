-- 0065_live_scheduling_config
-- Scheduling configuration becomes LIVE settings: no ConfigVersion, no DRAFT/ACTIVE status,
-- no effective ranges, no supersession. Edits write rows directly; the audit log is untouched.
--
-- DESTRUCTIVE (by design): config rows that belong to any version other than the one kept per
-- system are deleted, and the ConfigVersion table is dropped. See "migration risk" in the handover.
-- Kept version per system = the ACTIVE one; if a system has none, its highest-numbered version.
-- (TODO(confirm): that no-ACTIVE fallback is the conservative choice; the alternative is to keep nothing.)
--
-- Schedule-side pin columns (MusicDraft/MusicMonth/MusicLog/ProtocolPlan/ProtocolHistory
-- "configVersionId" and "musicConfigVersionId") are KEPT as plain nullable TEXT so published rows
-- keep their shape. Only the foreign keys go (via DROP TABLE ... CASCADE). Follow-up migration drops them.

-- 1. Which version survives for each system.
CREATE TEMP TABLE _keep AS
SELECT DISTINCT ON ("systemId") "id", "systemId"
FROM "ConfigVersion"
ORDER BY "systemId", ("status" = 'ACTIVE') DESC, "version" DESC;

-- 2. Protocol rules point at a Music service id; remap by code onto the surviving Music service
--    BEFORE the old services are deleted.
UPDATE "ProtocolServiceRule" r
SET "serviceId" = kept."id"
FROM "SchedulingService" old, "SchedulingService" kept, _keep k
WHERE old."id" = r."serviceId"
  AND k."systemId" = 'sys-music'
  AND kept."systemId" = 'sys-music'
  AND kept."configVersionId" = k."id"
  AND lower(kept."code") = lower(old."code")
  AND kept."id" <> r."serviceId";

-- 3. Discard every config row that belongs to a non-surviving version.
--    (Rows with a NULL configVersionId pre-date versioning and are left alone.)
DELETE FROM "MusicFixedAssignment" WHERE "configVersionId" NOT IN (SELECT "id" FROM _keep);
DELETE FROM "ChoirCategoryLink" WHERE "configVersionId" IS NOT NULL AND "configVersionId" NOT IN (SELECT "id" FROM _keep);
DELETE FROM "CategoryServicePolicy" WHERE "configVersionId" IS NOT NULL AND "configVersionId" NOT IN (SELECT "id" FROM _keep);
DELETE FROM "ChoirCategory" WHERE "configVersionId" IS NOT NULL AND "configVersionId" NOT IN (SELECT "id" FROM _keep);
DELETE FROM "ProtocolServiceRule" WHERE "configVersionId" IS NOT NULL AND "configVersionId" NOT IN (SELECT "id" FROM _keep);
DELETE FROM "ProtocolDutyPolicy" WHERE "configVersionId" IS NOT NULL AND "configVersionId" NOT IN (SELECT "id" FROM _keep);
DELETE FROM "SchedulingService" WHERE "configVersionId" IS NOT NULL AND "configVersionId" NOT IN (SELECT "id" FROM _keep);

-- 4. Drop the foreign keys and the table. CASCADE removes only the FK constraints that point at it.
DROP TABLE "ConfigVersion" CASCADE;

-- 5. Drop versioning columns. Postgres drops any index or unique constraint that uses a dropped column,
--    which removes every unique/partial-unique constraint that referenced "configVersionId".
ALTER TABLE "SchedulingService"       DROP COLUMN "configVersionId", DROP COLUMN "effectiveFrom", DROP COLUMN "effectiveTo", DROP COLUMN "supersedesId";
ALTER TABLE "ChoirCategory"           DROP COLUMN "configVersionId", DROP COLUMN "effectiveFrom", DROP COLUMN "effectiveTo", DROP COLUMN "supersedesId";
ALTER TABLE "CategoryServicePolicy"   DROP COLUMN "configVersionId", DROP COLUMN "effectiveFrom", DROP COLUMN "effectiveTo", DROP COLUMN "supersedesId";
ALTER TABLE "ChoirCategoryLink"       DROP COLUMN "configVersionId", DROP COLUMN "effectiveFrom", DROP COLUMN "effectiveTo", DROP COLUMN "supersedesId";
ALTER TABLE "MusicFixedAssignment"    DROP COLUMN "configVersionId";
ALTER TABLE "ProtocolServiceRule"     DROP COLUMN "configVersionId", DROP COLUMN "effectiveFrom", DROP COLUMN "effectiveTo", DROP COLUMN "supersedesId";
ALTER TABLE "ProtocolDutyPolicy"      DROP COLUMN "configVersionId", DROP COLUMN "effectiveFrom", DROP COLUMN "effectiveTo", DROP COLUMN "supersedesId";

-- 6. Indexes on the kept (historical) pin columns are no longer useful.
DROP INDEX IF EXISTS "MusicDraft_configVersionId_idx";
DROP INDEX IF EXISTS "MusicMonth_configVersionId_idx";
DROP INDEX IF EXISTS "MusicLog_configVersionId_idx";
DROP INDEX IF EXISTS "ProtocolPlan_configVersionId_idx";
DROP INDEX IF EXISTS "ProtocolPlan_musicConfigVersionId_idx";
DROP INDEX IF EXISTS "ProtocolHistory_configVersionId_idx";
DROP INDEX IF EXISTS "ProtocolHistory_musicConfigVersionId_idx";
CREATE INDEX IF NOT EXISTS "MusicFixedAssignment_systemId_idx" ON "MusicFixedAssignment"("systemId");

-- 7. New uniqueness. These FAIL LOUDLY (and roll the migration back) if duplicate rows exist.
CREATE UNIQUE INDEX "SchedulingService_systemId_code_key" ON "SchedulingService"("systemId", "code");
CREATE UNIQUE INDEX "ChoirCategory_systemId_code_key" ON "ChoirCategory"("systemId", "code");
CREATE UNIQUE INDEX "ProtocolServiceRule_systemId_serviceId_key" ON "ProtocolServiceRule"("systemId", "serviceId");
CREATE UNIQUE INDEX "ProtocolDutyPolicy_systemId_key" ON "ProtocolDutyPolicy"("systemId");
-- Partial unique indexes: Prisma cannot declare these, so they live only here.
CREATE UNIQUE INDEX "CategoryServicePolicy_active_key" ON "CategoryServicePolicy"("systemId", "categoryId", "serviceId") WHERE "active";
CREATE UNIQUE INDEX "ChoirCategoryLink_active_key" ON "ChoirCategoryLink"("systemId", "choirId", "categoryId") WHERE "active";

-- 8. Server-side edit lock (one row per system; no FK to Person on purpose).
CREATE TABLE IF NOT EXISTS "ConfigEditLock" (
  "systemId"       TEXT NOT NULL,
  "holderPersonId" TEXT NOT NULL,
  "acquiredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "refreshedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConfigEditLock_pkey" PRIMARY KEY ("systemId")
);

DROP TABLE _keep;
