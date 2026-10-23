-- Slice 1.2a: member codes, unit codes and the counter behind them. Add-only and safe to re-run.
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "memberCode" TEXT;
ALTER TABLE "OrgUnit" ADD COLUMN IF NOT EXISTS "code" TEXT;
CREATE TABLE IF NOT EXISTS "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Person_memberCode_key" ON "Person"("memberCode");
CREATE UNIQUE INDEX IF NOT EXISTS "OrgUnit_code_key" ON "OrgUnit"("code");
