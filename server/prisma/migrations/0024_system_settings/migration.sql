-- Slice 3.18: per-system Settings (unit details and money options). Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "SystemSetting" (
  "id" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "detailsJson" TEXT NOT NULL DEFAULT '{}',
  "moneyJson" TEXT NOT NULL DEFAULT '{}',
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SystemSetting_systemId_key" ON "SystemSetting"("systemId");

-- A person's chosen theme (light or dark) is kept with their other preferences.
ALTER TABLE "Preference" ADD COLUMN IF NOT EXISTS "theme" TEXT;
