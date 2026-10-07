-- Slice 3.19: the Money block (budget, action plan, contribution lists, donations). Add-only and idempotent.
CREATE TABLE IF NOT EXISTS "MoneyBudget" (
  "id" TEXT NOT NULL, "systemId" TEXT NOT NULL, "year" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT', "approvedById" TEXT, "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MoneyBudget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MoneyBudget_systemId_year_key" ON "MoneyBudget"("systemId", "year");

CREATE TABLE IF NOT EXISTS "MoneyBudgetLine" (
  "id" TEXT NOT NULL, "systemId" TEXT NOT NULL, "year" INTEGER NOT NULL, "kind" TEXT NOT NULL, "category" TEXT NOT NULL,
  "planned" INTEGER NOT NULL, "note" TEXT, "updatedById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MoneyBudgetLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MoneyBudgetLine_systemId_year_kind_category_key" ON "MoneyBudgetLine"("systemId", "year", "kind", "category");

CREATE TABLE IF NOT EXISTS "MoneyPlanItem" (
  "id" TEXT NOT NULL, "systemId" TEXT NOT NULL, "year" INTEGER NOT NULL, "title" TEXT NOT NULL, "amount" INTEGER NOT NULL,
  "dueMonth" TEXT, "category" TEXT, "status" TEXT NOT NULL DEFAULT 'PLANNED', "note" TEXT, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MoneyPlanItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MoneyPlanItem_systemId_year_idx" ON "MoneyPlanItem"("systemId", "year");

CREATE TABLE IF NOT EXISTS "ContributionList" (
  "id" TEXT NOT NULL, "systemId" TEXT NOT NULL, "level" TEXT NOT NULL, "typeCode" TEXT NOT NULL, "typeName" TEXT NOT NULL,
  "month" TEXT NOT NULL, "teamUnitId" TEXT, "teamName" TEXT, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sourceListIds" TEXT NOT NULL DEFAULT '[]', "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3), "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "decisionNote" TEXT,
  CONSTRAINT "ContributionList_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContributionList_systemId_month_idx" ON "ContributionList"("systemId", "month");

CREATE TABLE IF NOT EXISTS "ContributionLine" (
  "id" TEXT NOT NULL, "listId" TEXT NOT NULL, "name" TEXT NOT NULL, "personId" TEXT, "team" TEXT, "amount" INTEGER NOT NULL,
  CONSTRAINT "ContributionLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContributionLine_listId_idx" ON "ContributionLine"("listId");
CREATE INDEX IF NOT EXISTS "ContributionLine_personId_idx" ON "ContributionLine"("personId");

CREATE TABLE IF NOT EXISTS "Donation" (
  "id" TEXT NOT NULL, "systemId" TEXT NOT NULL, "accountId" TEXT NOT NULL, "donorName" TEXT NOT NULL, "amount" INTEGER NOT NULL,
  "receivedOn" TIMESTAMP(3) NOT NULL, "note" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "recordedById" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "decisionNote" TEXT, "entryId" TEXT,
  CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Donation_systemId_status_idx" ON "Donation"("systemId", "status");
