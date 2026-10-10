-- Good deeds of a member, recorded by a Unit Secretary. Add-only and safe to run twice.
CREATE TABLE IF NOT EXISTS "PersonDeed" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "unitId" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "deletedById" TEXT
);
CREATE INDEX IF NOT EXISTS "PersonDeed_personId_idx" ON "PersonDeed"("personId");
-- Rollback: DROP TABLE "PersonDeed";
