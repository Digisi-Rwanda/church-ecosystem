-- Slice 1.4: notifications, read state and preferences. Add-only and safe to re-run.
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "toPersonId" TEXT,
    "toOffice" TEXT,
    "toSystemId" TEXT,
    "systemId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "sourceKey" TEXT,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_toPersonId_createdAt_idx" ON "Notification"("toPersonId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_toOffice_createdAt_idx" ON "Notification"("toOffice", "createdAt");

CREATE TABLE IF NOT EXISTS "NotificationRead" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationRead_personId_key_key" ON "NotificationRead"("personId", "key");

CREATE TABLE IF NOT EXISTS "Preference" (
    "personId" TEXT NOT NULL,
    "language" TEXT,
    "mutedSystemsJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Preference_pkey" PRIMARY KEY ("personId")
);
