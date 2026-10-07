-- Slice 3.10: Evangelism contacts, follow-ups, Pulpit plan and guest preachers. Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "EvangelismContact" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "howMet" TEXT,
    "metOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedToId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvangelismContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EvangelismContact_status_idx" ON "EvangelismContact"("status");

CREATE TABLE IF NOT EXISTS "ContactFollowUp" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "doneOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "nextOn" TIMESTAMP(3),
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactFollowUp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContactFollowUp_contactId_idx" ON "ContactFollowUp"("contactId");

CREATE TABLE IF NOT EXISTS "GuestPreacher" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "church" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestPreacher_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PulpitSlot" (
    "id" TEXT NOT NULL,
    "serviceOn" TIMESTAMP(3) NOT NULL,
    "preacherPersonId" TEXT,
    "guestId" TEXT,
    "theme" TEXT,
    "bibleText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PulpitSlot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PulpitSlot_serviceOn_idx" ON "PulpitSlot"("serviceOn");
