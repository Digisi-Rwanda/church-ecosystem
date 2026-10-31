-- Slice 1.5: announcements. Add-only and safe to re-run.
CREATE TABLE IF NOT EXISTS "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audienceKind" TEXT NOT NULL,
    "audienceSystemId" TEXT,
    "audienceOffice" TEXT,
    "systemId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnById" TEXT,
    "withdrawnReason" TEXT,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Announcement_publishedAt_idx" ON "Announcement"("publishedAt");
