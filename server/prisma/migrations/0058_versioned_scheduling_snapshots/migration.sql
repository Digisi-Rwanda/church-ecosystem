-- Keep configuration records from different published versions side by side.
-- Existing rows with NULL configVersionId remain readable as legacy records.
DROP INDEX IF EXISTS "SchedulingService_systemId_code_key";
CREATE UNIQUE INDEX "SchedulingService_systemId_code_configVersionId_key"
    ON "SchedulingService"("systemId", "code", "configVersionId");

DROP INDEX IF EXISTS "ChoirCategory_systemId_code_key";
CREATE UNIQUE INDEX "ChoirCategory_systemId_code_configVersionId_key"
    ON "ChoirCategory"("systemId", "code", "configVersionId");

DROP INDEX IF EXISTS "CategoryServicePolicy_systemId_categoryId_serviceId_key";
CREATE UNIQUE INDEX "CategoryServicePolicy_config_version_key"
    ON "CategoryServicePolicy"("systemId", "categoryId", "serviceId", "configVersionId");

DROP INDEX IF EXISTS "ChoirCategoryLink_systemId_choirId_key";
CREATE UNIQUE INDEX "ChoirCategoryLink_systemId_choirId_configVersionId_key"
    ON "ChoirCategoryLink"("systemId", "choirId", "configVersionId");

DROP INDEX IF EXISTS "ProtocolServiceRule_systemId_serviceId_key";
CREATE UNIQUE INDEX "ProtocolServiceRule_systemId_serviceId_configVersionId_key"
    ON "ProtocolServiceRule"("systemId", "serviceId", "configVersionId");

ALTER TABLE "MusicDraft" ADD COLUMN "configVersionId" TEXT;
CREATE INDEX "MusicDraft_configVersionId_idx" ON "MusicDraft"("configVersionId");

ALTER TABLE "ProtocolHistory" ADD COLUMN "configVersionId" TEXT;
CREATE INDEX "ProtocolHistory_configVersionId_idx" ON "ProtocolHistory"("configVersionId");

ALTER TABLE "MusicLog" ADD COLUMN "configVersionId" TEXT;
ALTER TABLE "MusicLog" ADD COLUMN "servicesSnapshotJson" TEXT;
ALTER TABLE "MusicLog" ADD COLUMN "assignmentsSnapshotJson" TEXT;
CREATE INDEX "MusicLog_configVersionId_idx" ON "MusicLog"("configVersionId");
