-- Slice 3.8: groups (fellowships, classes, age groups), members and sessions. Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "UnitGroup" (
    "id" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderPersonId" TEXT,
    "ageFrom" INTEGER,
    "ageTo" INTEGER,
    "meetsOn" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnitGroup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UnitGroup_systemId_status_idx" ON "UnitGroup"("systemId", "status");

CREATE TABLE IF NOT EXISTS "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "joinedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftOn" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GroupMember_groupId_status_idx" ON "GroupMember"("groupId", "status");
CREATE INDEX IF NOT EXISTS "GroupMember_personId_idx" ON "GroupMember"("personId");

CREATE TABLE IF NOT EXISTS "GroupSession" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "heldOn" TIMESTAMP(3) NOT NULL,
    "presentJson" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GroupSession_groupId_heldOn_idx" ON "GroupSession"("groupId", "heldOn");
