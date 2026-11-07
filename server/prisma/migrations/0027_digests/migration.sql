-- Slice 4.4: the daily digest. Add-only and idempotent. Rollback: DROP TABLE "DigestLog"; ALTER TABLE "Preference" DROP COLUMN "digestChannel";
ALTER TABLE "Preference" ADD COLUMN IF NOT EXISTS "digestChannel" TEXT NOT NULL DEFAULT 'OFF';
CREATE TABLE IF NOT EXISTS "DigestLog" (
  "id" TEXT NOT NULL, "personId" TEXT NOT NULL, "day" TEXT NOT NULL, "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DigestLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DigestLog_personId_day_key" ON "DigestLog"("personId", "day");
