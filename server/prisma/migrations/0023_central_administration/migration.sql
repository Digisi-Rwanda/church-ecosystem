-- Slice 3.19: the main church system is named Central Administration. A rename only; ids, codes and access are unchanged. Idempotent.
UPDATE "ChurchSystem"
SET "name" = 'ADEPR Kacyiru — Central Administration',
    "shortName" = 'Central Administration',
    "description" = 'Church leadership: governance, oversight, reports received, collections, pulpit and settings'
WHERE "id" = 'sys-main';
