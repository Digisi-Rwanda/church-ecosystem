-- 0044: files attached to an activity (program, event or project). Add-only and idempotent.
-- Rollback (manual): DROP TABLE "PlanFile";
CREATE TABLE IF NOT EXISTS "PlanFile" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "dataBase64" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "deletedById" TEXT,
  CONSTRAINT "PlanFile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PlanFile_planId_idx" ON "PlanFile"("planId");
