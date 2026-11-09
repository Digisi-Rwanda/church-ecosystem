-- Slice 2.3: the Letters desk. Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "Letter" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedAt" TIMESTAMP(3),
    "printedById" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "deliveredById" TEXT,
    "deliveryMethod" TEXT,
    "deliveredOn" TIMESTAMP(3),
    "deliveryNote" TEXT,
    "withdrawnReason" TEXT,
    CONSTRAINT "Letter_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Letter_systemId_createdAt_idx" ON "Letter"("systemId", "createdAt");
