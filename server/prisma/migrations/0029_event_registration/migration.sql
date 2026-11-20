-- Phase B: event registration and attendance, project milestones. Add-only and idempotent.
-- Rollback: DROP TABLE "WorkPlanMilestone"; DROP TABLE "WorkPlanRegistration"; ALTER TABLE "WorkPlan" DROP COLUMN "registrationOpen", DROP COLUMN "capacity", DROP COLUMN "publicToken";
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "registrationOpen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "publicToken" TEXT;
CREATE TABLE IF NOT EXISTS "WorkPlanMilestone" (
  "id" TEXT NOT NULL, "planId" TEXT NOT NULL, "title" TEXT NOT NULL, "dueOn" TIMESTAMP(3),
  "done" BOOLEAN NOT NULL DEFAULT false, "doneById" TEXT, "doneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPlanMilestone_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkPlanMilestone_planId_idx" ON "WorkPlanMilestone"("planId");
CREATE TABLE IF NOT EXISTS "WorkPlanRegistration" (
  "id" TEXT NOT NULL, "planId" TEXT NOT NULL, "personId" TEXT, "name" TEXT NOT NULL, "phone" TEXT, "source" TEXT NOT NULL,
  "attended" BOOLEAN NOT NULL DEFAULT false, "attendedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPlanRegistration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkPlanRegistration_planId_idx" ON "WorkPlanRegistration"("planId");
