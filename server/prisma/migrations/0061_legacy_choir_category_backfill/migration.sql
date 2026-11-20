-- Backfill explicit membership from the legacy MusicChoir.role field.
-- The seed and API define an exact role-to-category mapping by matching role
-- to category code: PRIMARY, SECONDARY, CHILDREN, and WORSHIP.
--
-- Only the latest ACTIVE Music configuration is eligible. Legacy roles are
-- not versioned, so they cannot safely reconstruct historical memberships;
-- historical and DRAFT configuration versions are intentionally untouched.
-- Missing categories, unsupported roles, and choirs with any existing link
-- are skipped rather than guessed or overwritten.
--
-- createdByPersonId retains the creator of the legacy choir row as provenance;
-- the migration itself has no authenticated person identity.
INSERT INTO "ChoirCategoryLink" (
    "id",
    "systemId",
    "choirId",
    "categoryId",
    "eligibleOverrideJson",
    "frequencyOverrideJson",
    "active",
    "effectiveFrom",
    "effectiveTo",
    "supersedesId",
    "createdByPersonId",
    "createdAt",
    "configVersionId"
)
SELECT
    'legacy-role-link-' || cv."id" || '-' || choir."id",
    'sys-music',
    choir."id",
    category."id",
    '{}',
    '{}',
    true,
    CURRENT_TIMESTAMP,
    NULL,
    NULL,
    choir."createdById",
    CURRENT_TIMESTAMP,
    cv."id"
FROM "MusicChoir" AS choir
JOIN "ConfigVersion" AS cv
    ON cv."id" = (
        SELECT candidate."id"
        FROM "ConfigVersion" AS candidate
        WHERE candidate."systemId" = 'sys-music'
          AND candidate."status" = 'ACTIVE'
        ORDER BY candidate."version" DESC
        LIMIT 1
    )
JOIN "ChoirCategory" AS category
    ON category."systemId" = 'sys-music'
   AND category."configVersionId" = cv."id"
   AND category."code" = choir."role"
   AND category."active" = true
WHERE choir."role" IN ('PRIMARY', 'SECONDARY', 'CHILDREN', 'WORSHIP')
  AND NOT EXISTS (
      SELECT 1
      FROM "ChoirCategoryLink" AS existing
      WHERE existing."systemId" = 'sys-music'
        AND existing."choirId" = choir."id"
        AND existing."configVersionId" = cv."id"
  );
