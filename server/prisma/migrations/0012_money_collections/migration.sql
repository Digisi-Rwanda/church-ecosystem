-- Slice 3.4: Money (accounts, entries) and Collections (offering counts). Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "MoneyAccount" (
    "id" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MoneyAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MoneyAccount_systemId_status_idx" ON "MoneyAccount"("systemId", "status");

CREATE TABLE IF NOT EXISTS "MoneyEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    CONSTRAINT "MoneyEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MoneyEntry_accountId_status_idx" ON "MoneyEntry"("accountId", "status");
CREATE INDEX IF NOT EXISTS "MoneyEntry_systemId_occurredOn_idx" ON "MoneyEntry"("systemId", "occurredOn");

CREATE TABLE IF NOT EXISTS "OfferingCount" (
    "id" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "serviceOn" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OFFERING',
    "amount" INTEGER NOT NULL,
    "countersJson" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "handedToId" TEXT,
    "handedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    CONSTRAINT "OfferingCount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OfferingCount_systemId_serviceOn_idx" ON "OfferingCount"("systemId", "serviceOn");
