-- Slice 3.13: choir rehearsals, repertoire, sponsors and pledges. Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "ChoirRehearsal" (
    "id" TEXT NOT NULL,
    "choirId" TEXT NOT NULL,
    "heldOn" TIMESTAMP(3) NOT NULL,
    "presentJson" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChoirRehearsal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChoirRehearsal_choirId_heldOn_idx" ON "ChoirRehearsal"("choirId", "heldOn");

CREATE TABLE IF NOT EXISTS "ChoirSong" (
    "id" TEXT NOT NULL,
    "choirId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "composer" TEXT,
    "songKey" TEXT,
    "lastSungOn" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChoirSong_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChoirSong_choirId_idx" ON "ChoirSong"("choirId");

CREATE TABLE IF NOT EXISTS "ChoirSponsor" (
    "id" TEXT NOT NULL,
    "choirId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PERSON',
    "contact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChoirSponsor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChoirSponsor_choirId_idx" ON "ChoirSponsor"("choirId");

CREATE TABLE IF NOT EXISTS "SponsorPledge" (
    "id" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "pledgedOn" TIMESTAMP(3) NOT NULL,
    "receivedOn" TIMESTAMP(3),
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLEDGED',
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SponsorPledge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SponsorPledge_sponsorId_idx" ON "SponsorPledge"("sponsorId");
