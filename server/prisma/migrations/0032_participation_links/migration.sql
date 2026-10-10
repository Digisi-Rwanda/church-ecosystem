-- 0032: a donation and a sponsor can name the member they belong to, so Person 360 can list a person's participation.
-- Add-only and idempotent. Rollback (manual): drop the added columns and indexes.
ALTER TABLE "Donation" ADD COLUMN IF NOT EXISTS "donorPersonId" TEXT;
CREATE INDEX IF NOT EXISTS "Donation_donorPersonId_idx" ON "Donation"("donorPersonId");
ALTER TABLE "ChoirSponsor" ADD COLUMN IF NOT EXISTS "personId" TEXT;
CREATE INDEX IF NOT EXISTS "ChoirSponsor_personId_idx" ON "ChoirSponsor"("personId");
