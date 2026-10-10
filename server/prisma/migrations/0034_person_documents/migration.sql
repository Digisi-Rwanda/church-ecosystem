-- 0034: files kept on a person's profile (Person 360, Files/Documents). Add-only and idempotent.
-- Rollback (manual): DROP TABLE "PersonDocument";
CREATE TABLE IF NOT EXISTS "PersonDocument" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "dataBase64" TEXT NOT NULL,
  "note" TEXT,
  "uploadedById" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "deletedById" TEXT,
  CONSTRAINT "PersonDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PersonDocument_personId_idx" ON "PersonDocument"("personId");
