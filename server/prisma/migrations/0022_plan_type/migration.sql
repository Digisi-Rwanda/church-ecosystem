-- Slice 3.18: a plan is a Program, an Event or a Project. Add-only and idempotent; existing plans become Projects.
ALTER TABLE "WorkPlan" ADD COLUMN IF NOT EXISTS "planType" TEXT NOT NULL DEFAULT 'PROJECT';
