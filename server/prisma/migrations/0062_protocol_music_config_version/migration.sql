-- Pin Protocol plans and published snapshots to the shared Music configuration
-- that supplied their calendar and choir-category membership. Existing rows
-- remain readable with a NULL pin; no historical version is inferred.
ALTER TABLE "ProtocolPlan" ADD COLUMN "musicConfigVersionId" TEXT;
ALTER TABLE "ProtocolHistory" ADD COLUMN "musicConfigVersionId" TEXT;

CREATE INDEX "ProtocolPlan_musicConfigVersionId_idx"
    ON "ProtocolPlan"("musicConfigVersionId");
CREATE INDEX "ProtocolHistory_musicConfigVersionId_idx"
    ON "ProtocolHistory"("musicConfigVersionId");
