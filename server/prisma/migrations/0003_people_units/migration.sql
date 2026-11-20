-- Slice 1.2: person archive, unit kind, one office record. Add-only and safe to re-run.
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "archivedReason" TEXT;
ALTER TABLE "OrgUnit" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "office" TEXT;
