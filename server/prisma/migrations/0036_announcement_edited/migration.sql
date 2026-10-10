-- 0036: when an announcement was last edited. Add-only and idempotent.
-- Rollback (manual): ALTER TABLE "Announcement" DROP COLUMN "editedAt";
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
