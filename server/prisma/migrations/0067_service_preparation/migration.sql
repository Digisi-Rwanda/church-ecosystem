-- Service preparation. Replaces the Pulpit plan (one preacher per date) with pulpit roles that the church
-- defines and entries that belong to a service, so two services on one Sunday can have different preachers.
-- The old PulpitSlot table is kept untouched; it is no longer read or written.

CREATE TABLE "ServicePulpitRole" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServicePulpitRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServicePulpitRole_code_key" ON "ServicePulpitRole"("code");

CREATE TABLE "ServicePulpitEntry" (
  "id" TEXT NOT NULL,
  "serviceDate" TEXT NOT NULL,
  "serviceCode" TEXT,
  "roleId" TEXT NOT NULL,
  "personId" TEXT,
  "guestId" TEXT,
  "guestName" TEXT,
  "theme" TEXT,
  "bibleText" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServicePulpitEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServicePulpitEntry_serviceDate_idx" ON "ServicePulpitEntry"("serviceDate");

CREATE TABLE "ServicePrepEditor" (
  "personId" TEXT NOT NULL,
  "grantedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServicePrepEditor_pkey" PRIMARY KEY ("personId")
);

-- The one role a church starts with. It can be renamed or deactivated and others added.
INSERT INTO "ServicePulpitRole" ("id", "code", "name", "displayOrder") VALUES ('pulpit-role-preacher', 'preacher', 'Preacher', 0);

-- Every existing pulpit slot becomes a Preacher entry for that date. The old plan did not say which service,
-- so serviceCode stays empty (the whole day) until the leader assigns it to one.
INSERT INTO "ServicePulpitEntry"
  ("id", "serviceDate", "serviceCode", "roleId", "personId", "guestId", "theme", "bibleText", "status", "createdById", "createdAt", "updatedAt")
SELECT 'conv-' || "id", to_char("serviceOn" AT TIME ZONE 'UTC', 'YYYY-MM-DD'), NULL, 'pulpit-role-preacher',
       "preacherPersonId", "guestId", "theme", "bibleText", "status", "createdById", "createdAt", CURRENT_TIMESTAMP
FROM "PulpitSlot";
