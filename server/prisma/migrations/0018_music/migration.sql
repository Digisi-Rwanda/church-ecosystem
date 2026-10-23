-- Slice 3.12: Music choirs, register, month plan. Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "MusicChoir" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "systemId" TEXT,
    "orgUnitId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MusicChoir_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MusicChoirMember" (
    "id" TEXT NOT NULL,
    "choirId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MusicChoirMember_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MusicChoirMember_choirId_status_idx" ON "MusicChoirMember"("choirId", "status");
CREATE INDEX IF NOT EXISTS "MusicChoirMember_personId_idx" ON "MusicChoirMember"("personId");

CREATE TABLE IF NOT EXISTS "MusicPlan" (
    "id" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MusicPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MusicPlan_periodKey_key" ON "MusicPlan"("periodKey");

CREATE TABLE IF NOT EXISTS "MusicService" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "serviceOn" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "MusicService_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MusicService_planId_idx" ON "MusicService"("planId");

CREATE TABLE IF NOT EXISTS "MusicAssignment" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "choirId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "MusicAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MusicAssignment_serviceId_idx" ON "MusicAssignment"("serviceId");
