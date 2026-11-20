-- Add-only Music scheduling foundation. Existing versions and schedules remain readable.
ALTER TABLE "CategoryServicePolicy" ADD COLUMN "frequencyPeriod" TEXT;

CREATE TABLE "MusicFixedAssignment" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "configVersionId" TEXT NOT NULL,
    "categoryServicePolicyId" TEXT NOT NULL,
    "choirId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdByPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MusicFixedAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MusicFixedAssignment_configVersionId_fkey"
        FOREIGN KEY ("configVersionId") REFERENCES "ConfigVersion"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MusicFixedAssignment_categoryServicePolicyId_fkey"
        FOREIGN KEY ("categoryServicePolicyId") REFERENCES "CategoryServicePolicy"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MusicFixedAssignment_systemId_categoryServicePolicyId_choirId_key"
    ON "MusicFixedAssignment"("systemId", "categoryServicePolicyId", "choirId");
CREATE INDEX "MusicFixedAssignment_systemId_configVersionId_idx"
    ON "MusicFixedAssignment"("systemId", "configVersionId");
CREATE INDEX "MusicFixedAssignment_categoryServicePolicyId_idx"
    ON "MusicFixedAssignment"("categoryServicePolicyId");

CREATE TABLE "MusicChoirUnavailability" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "choirId" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "serviceCode" TEXT,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "recordedByPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MusicChoirUnavailability_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MusicChoirUnavailability_systemId_choirId_serviceDate_active_idx"
    ON "MusicChoirUnavailability"("systemId", "choirId", "serviceDate", "active");
CREATE INDEX "MusicChoirUnavailability_systemId_serviceDate_serviceCode_active_idx"
    ON "MusicChoirUnavailability"("systemId", "serviceDate", "serviceCode", "active");
