-- Service run-sheet: the activities of one service, an optional planned end, and an editable template per service code.
CREATE TABLE "ServiceRunSheet" (
  "serviceDate" TEXT NOT NULL,
  "serviceCode" TEXT NOT NULL,
  "endTime" TEXT,
  "updatedById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceRunSheet_pkey" PRIMARY KEY ("serviceDate", "serviceCode")
);

CREATE TABLE "ServiceRunItem" (
  "id" TEXT NOT NULL,
  "serviceDate" TEXT NOT NULL,
  "serviceCode" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "ownerKind" TEXT NOT NULL,
  "personId" TEXT,
  "roleId" TEXT,
  "ownerLabel" TEXT,
  "note" TEXT,
  CONSTRAINT "ServiceRunItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceRunItem_serviceDate_serviceCode_idx" ON "ServiceRunItem"("serviceDate", "serviceCode");

CREATE TABLE "ServiceRunTemplateItem" (
  "id" TEXT NOT NULL,
  "serviceCode" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "ownerKind" TEXT NOT NULL,
  "roleId" TEXT,
  "ownerLabel" TEXT,
  "note" TEXT,
  CONSTRAINT "ServiceRunTemplateItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceRunTemplateItem_serviceCode_idx" ON "ServiceRunTemplateItem"("serviceCode");
