-- Preserve existing fixed assignments as recurring at every occurrence.
ALTER TABLE "MusicFixedAssignment" ADD COLUMN "serviceDate" TEXT;
ALTER TABLE "MusicFixedAssignment" ADD COLUMN "serviceTime" TEXT;
ALTER TABLE "MusicFixedAssignment" ADD COLUMN "scopeKey" TEXT NOT NULL DEFAULT 'ALL';
DROP INDEX "MusicFixedAssignment_systemId_categoryServicePolicyId_choirId_key";
CREATE UNIQUE INDEX "MusicFixedAssignment_scope_key"
ON "MusicFixedAssignment"("systemId", "categoryServicePolicyId", "choirId", "scopeKey");
-- Existing single-day records keep their meaning without rewriting history.
ALTER TABLE "MusicChoirUnavailability" ADD COLUMN "endDate" TEXT;
