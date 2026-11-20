-- Slice 3.2: Light work. Add-only and idempotent.
ALTER TABLE "WorkTask" ADD COLUMN IF NOT EXISTS "orgUnitId" TEXT;
ALTER TABLE "WorkTask" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "WorkTask" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
