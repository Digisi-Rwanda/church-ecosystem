-- Phase C: optional parent links, program steering, reviews and indicators. Add-only and idempotent.
-- Rollback: DROP TABLE "WorkPlanReview"; DROP TABLE "WorkPlanIndicator"; DROP TABLE "WorkPlanMeasure"; ALTER TABLE "WorkPlan" DROP COLUMN "parentId", DROP COLUMN "steeringJson";
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "steeringJson" TEXT NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS "WorkPlanReview" (
  "id" TEXT NOT NULL, "planId" TEXT NOT NULL, "heldOn" TIMESTAMP(3) NOT NULL, "summary" TEXT NOT NULL, "decision" TEXT NOT NULL,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPlanReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkPlanReview_planId_idx" ON "WorkPlanReview"("planId");
CREATE TABLE IF NOT EXISTS "WorkPlanIndicator" (
  "id" TEXT NOT NULL, "planId" TEXT NOT NULL, "name" TEXT NOT NULL, "unit" TEXT NOT NULL DEFAULT '', "target" DOUBLE PRECISION NOT NULL,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPlanIndicator_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkPlanIndicator_planId_idx" ON "WorkPlanIndicator"("planId");
CREATE TABLE IF NOT EXISTS "WorkPlanMeasure" (
  "id" TEXT NOT NULL, "indicatorId" TEXT NOT NULL, "planId" TEXT NOT NULL, "value" DOUBLE PRECISION NOT NULL, "note" TEXT,
  "byId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPlanMeasure_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkPlanMeasure_indicatorId_idx" ON "WorkPlanMeasure"("indicatorId");
