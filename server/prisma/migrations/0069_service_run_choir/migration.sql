-- A run-sheet line (and a template line) can name a specific choir.
ALTER TABLE "ServiceRunItem" ADD COLUMN "choirId" TEXT;
ALTER TABLE "ServiceRunTemplateItem" ADD COLUMN "choirId" TEXT;
