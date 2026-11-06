# Live scheduling configuration: remove config versioning

Config is now live settings. Every save applies at once; the next generate call reads it. The audit log is kept. Nothing was committed or pushed. A commit message is at the end.

Not verified: Prisma generate is unavailable in the cloud, so there was no `tsc` and no server tests. All 70+ new or edited files pass a TypeScript syntax parse. `validateForGeneration` was not executed.

---

## 1. Schema migration

### `server/prisma/migrations/0065_live_scheduling_config/migration.sql`
_Collapse to one live set per system, drop ConfigVersion and the version columns, add uniqueness and the lock table._

```sql
-- 0065_live_scheduling_config
-- Scheduling configuration becomes LIVE settings: no ConfigVersion, no DRAFT/ACTIVE status,
-- no effective ranges, no supersession. Edits write rows directly; the audit log is untouched.
--
-- DESTRUCTIVE (by design): config rows that belong to any version other than the one kept per
-- system are deleted, and the ConfigVersion table is dropped. See "migration risk" in the handover.
-- Kept version per system = the ACTIVE one; if a system has none, its highest-numbered version.
-- (TODO(confirm): that no-ACTIVE fallback is the conservative choice; the alternative is to keep nothing.)
--
-- Schedule-side pin columns (MusicDraft/MusicMonth/MusicLog/ProtocolPlan/ProtocolHistory
-- "configVersionId" and "musicConfigVersionId") are KEPT as plain nullable TEXT so published rows
-- keep their shape. Only the foreign keys go (via DROP TABLE ... CASCADE). Follow-up migration drops them.

-- 1. Which version survives for each system.
CREATE TEMP TABLE _keep AS
SELECT DISTINCT ON ("systemId") "id", "systemId"
FROM "ConfigVersion"
ORDER BY "systemId", ("status" = 'ACTIVE') DESC, "version" DESC;

-- 2. Protocol rules point at a Music service id; remap by code onto the surviving Music service
--    BEFORE the old services are deleted.
UPDATE "ProtocolServiceRule" r
SET "serviceId" = kept."id"
FROM "SchedulingService" old, "SchedulingService" kept, _keep k
WHERE old."id" = r."serviceId"
  AND k."systemId" = 'sys-music'
  AND kept."systemId" = 'sys-music'
  AND kept."configVersionId" = k."id"
  AND lower(kept."code") = lower(old."code")
  AND kept."id" <> r."serviceId";

-- 3. Discard every config row that belongs to a non-surviving version.
--    (Rows with a NULL configVersionId pre-date versioning and are left alone.)
DELETE FROM "MusicFixedAssignment" WHERE "configVersionId" NOT IN (SELECT "id" FROM _keep);
DELETE FROM "ChoirCategoryLink" WHERE "configVersionId" IS NOT NULL AND "configVersionId" NOT IN (SELECT "id" FROM _keep);
DELETE FROM "CategoryServicePolicy" WHERE "configVersionId" IS NOT NULL AND "configVersionId" NOT IN (SELECT "id" FROM _keep);
DELETE FROM "ChoirCategory" WHERE "configVersionId" IS NOT NULL AND "configVersionId" NOT IN (SELECT "id" FROM _keep);
DELETE FROM "ProtocolServiceRule" WHERE "configVersionId" IS NOT NULL AND "configVersionId" NOT IN (SELECT "id" FROM _keep);
DELETE FROM "ProtocolDutyPolicy" WHERE "configVersionId" IS NOT NULL AND "configVersionId" NOT IN (SELECT "id" FROM _keep);
DELETE FROM "SchedulingService" WHERE "configVersionId" IS NOT NULL AND "configVersionId" NOT IN (SELECT "id" FROM _keep);

-- 4. Drop the foreign keys and the table. CASCADE removes only the FK constraints that point at it.
DROP TABLE "ConfigVersion" CASCADE;

-- 5. Drop versioning columns. Postgres drops any index or unique constraint that uses a dropped column,
--    which removes every unique/partial-unique constraint that referenced "configVersionId".
ALTER TABLE "SchedulingService"       DROP COLUMN "configVersionId", DROP COLUMN "effectiveFrom", DROP COLUMN "effectiveTo", DROP COLUMN "supersedesId";
ALTER TABLE "ChoirCategory"           DROP COLUMN "configVersionId", DROP COLUMN "effectiveFrom", DROP COLUMN "effectiveTo", DROP COLUMN "supersedesId";
ALTER TABLE "CategoryServicePolicy"   DROP COLUMN "configVersionId", DROP COLUMN "effectiveFrom", DROP COLUMN "effectiveTo", DROP COLUMN "supersedesId";
ALTER TABLE "ChoirCategoryLink"       DROP COLUMN "configVersionId", DROP COLUMN "effectiveFrom", DROP COLUMN "effectiveTo", DROP COLUMN "supersedesId";
ALTER TABLE "MusicFixedAssignment"    DROP COLUMN "configVersionId";
ALTER TABLE "ProtocolServiceRule"     DROP COLUMN "configVersionId", DROP COLUMN "effectiveFrom", DROP COLUMN "effectiveTo", DROP COLUMN "supersedesId";
ALTER TABLE "ProtocolDutyPolicy"      DROP COLUMN "configVersionId", DROP COLUMN "effectiveFrom", DROP COLUMN "effectiveTo", DROP COLUMN "supersedesId";

-- 6. Indexes on the kept (historical) pin columns are no longer useful.
DROP INDEX IF EXISTS "MusicDraft_configVersionId_idx";
DROP INDEX IF EXISTS "MusicMonth_configVersionId_idx";
DROP INDEX IF EXISTS "MusicLog_configVersionId_idx";
DROP INDEX IF EXISTS "ProtocolPlan_configVersionId_idx";
DROP INDEX IF EXISTS "ProtocolPlan_musicConfigVersionId_idx";
DROP INDEX IF EXISTS "ProtocolHistory_configVersionId_idx";
DROP INDEX IF EXISTS "ProtocolHistory_musicConfigVersionId_idx";
CREATE INDEX IF NOT EXISTS "MusicFixedAssignment_systemId_idx" ON "MusicFixedAssignment"("systemId");

-- 7. New uniqueness. These FAIL LOUDLY (and roll the migration back) if duplicate rows exist.
CREATE UNIQUE INDEX "SchedulingService_systemId_code_key" ON "SchedulingService"("systemId", "code");
CREATE UNIQUE INDEX "ChoirCategory_systemId_code_key" ON "ChoirCategory"("systemId", "code");
CREATE UNIQUE INDEX "ProtocolServiceRule_systemId_serviceId_key" ON "ProtocolServiceRule"("systemId", "serviceId");
CREATE UNIQUE INDEX "ProtocolDutyPolicy_systemId_key" ON "ProtocolDutyPolicy"("systemId");
-- Partial unique indexes: Prisma cannot declare these, so they live only here.
CREATE UNIQUE INDEX "CategoryServicePolicy_active_key" ON "CategoryServicePolicy"("systemId", "categoryId", "serviceId") WHERE "active";
CREATE UNIQUE INDEX "ChoirCategoryLink_active_key" ON "ChoirCategoryLink"("systemId", "choirId", "categoryId") WHERE "active";

-- 8. Server-side edit lock (one row per system; no FK to Person on purpose).
CREATE TABLE IF NOT EXISTS "ConfigEditLock" (
  "systemId"       TEXT NOT NULL,
  "holderPersonId" TEXT NOT NULL,
  "acquiredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "refreshedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConfigEditLock_pkey" PRIMARY KEY ("systemId")
);

DROP TABLE _keep;
```

### `server/prisma/schema.prisma (diff)`
_Models only. schema.postgres.prisma gets the same edit (parity checked)._

```diff
--- a/server/prisma/schema.prisma
+++ b/server/prisma/schema.prisma
@@ -1399,13 +1399,10 @@
   updatedAt         DateTime  @default(now())
   /// The scheduling-config version this plan was built against, so the plan
   /// stays reproducible and stale-detection can compare config versions.
-  configVersionId   String?
-  configVersion     ConfigVersion? @relation(fields: [configVersionId], references: [id])
+  configVersionId   String? // TODO(drop): historical pin, no longer written; drop after backfill
   /// The exact shared Music calendar/category version used by this plan.
-  musicConfigVersionId String?
+  musicConfigVersionId String? // TODO(drop): historical pin, no longer written; drop after backfill
 
-  @@index([configVersionId])
-  @@index([musicConfigVersionId])
 }
 
 /// A person on a service's team. Removed rows are deleted from the working plan; published versions keep a snapshot.
@@ -1438,14 +1435,11 @@
   slotsJson     String
   notesJson     String   @default("[]")
   /// The Protocol rules version used to generate and publish this snapshot.
-  configVersionId String?
-  configVersion ConfigVersion? @relation(fields: [configVersionId], references: [id])
+  configVersionId String? // TODO(drop): historical pin, no longer written; drop after backfill
   /// The exact shared Music calendar/category version used by this snapshot.
-  musicConfigVersionId String?
+  musicConfigVersionId String? // TODO(drop): historical pin, no longer written; drop after backfill
 
   @@unique([monthKey, version])
-  @@index([configVersionId])
-  @@index([musicConfigVersionId])
 }
 
 /// Present, half present, excused or absent: one row per person per service.
@@ -1536,10 +1530,8 @@
   createdById    String
   createdAt      DateTime @default(now())
   /// The Music rules version used to generate and validate this draft.
-  configVersionId String?
-  configVersion ConfigVersion? @relation(fields: [configVersionId], references: [id])
+  configVersionId String? // TODO(drop): historical pin, no longer written; drop after backfill
 
-  @@index([configVersionId])
 }
 
 /// A month the Music team has confirmed (Protocol may plan against it) or published (the choirs see it).
@@ -1562,10 +1554,8 @@
   updatedById     String?
   /// The scheduling-config version this confirmed/published month was generated
   /// and validated against, so the month stays reproducible.
-  configVersionId String?
-  configVersion   ConfigVersion? @relation(fields: [configVersionId], references: [id])
+  configVersionId String? // TODO(drop): historical pin, no longer written; drop after backfill
 
-  @@index([configVersionId])
 }
 
 /// Every confirm, publish and edit of a month, kept for good.
@@ -1582,13 +1572,11 @@
   summary     String
   changesJson String   @default("[]")
   /// Version and full schedule state at this logged transition.
-  configVersionId String?
-  configVersion ConfigVersion? @relation(fields: [configVersionId], references: [id])
+  configVersionId String? // TODO(drop): historical pin, no longer written; drop after backfill
   servicesSnapshotJson String?
   assignmentsSnapshotJson String?
 
   @@index([periodKey])
-  @@index([configVersionId])
 }
 
 /// The preferences of one system: unit details and money options, as JSON (slice 3.18).
@@ -2110,43 +2098,20 @@
 
 /* ─── Configurable scheduling (Music & Protocol) ───
 
-   Versioned, tenant-scoped configuration that replaces hard-coded church
-   scheduling policy. Every row carries systemId (tenant), effectiveFrom /
-   effectiveTo and status, so edits create a new version instead of
-   overwriting history. schedules reference ConfigVersion to stay reproducible.
+   Live, tenant-scoped configuration. Rows are edited in place and the next
+   generate call reads them. Confirmed/published schedules are frozen copies,
+   so later config edits never rebuild them. Every change is audited.
 */
 
-/// One published snapshot of a church's scheduling configuration.
-model ConfigVersion {
-  id                 String   @id @default(cuid())
-  systemId           String
-  version            Int
-  label              String
-  status             String   @default("DRAFT") // DRAFT | ACTIVE | SUPERSEDED | SCHEDULED
-  effectiveFrom      DateTime @default(now())
-  effectiveTo        DateTime?
-  createdByPersonId  String
-  createdAt          DateTime @default(now())
-  reason             String?
-  previousVersionId  String?
-  notesJson          String   @default("{}")
-  validationJson     String   @default("{}")
-  affectedSchedulesJson String @default("[]")
-  musicMonths        MusicMonth[]
-  musicDrafts        MusicDraft[]
-  musicLogs           MusicLog[]
-  protocolPlans      ProtocolPlan[]
-  protocolHistories  ProtocolHistory[]
-  schedulingServices SchedulingService[]
-  choirCategories    ChoirCategory[]
-  categoryServicePolicies CategoryServicePolicy[]
-  choirCategoryLinks ChoirCategoryLink[]
-  musicFixedAssignments MusicFixedAssignment[]
-  protocolServiceRules ProtocolServiceRule[]
-  protocolDutyPolicies ProtocolDutyPolicy[]
-
-  @@unique([systemId, version])
-  @@index([systemId, status])
+/// Server-side edit lock for scheduling configuration, one row per system.
+/// Config edits affect ALL future generation, so they must be serialized.
+/// No foreign key to Person on purpose: a deleted person must never wedge the lock.
+model ConfigEditLock {
+  systemId       String   @id
+  holderPersonId String
+  acquiredAt     DateTime @default(now())
+  expiresAt      DateTime
+  refreshedAt    DateTime @default(now())
 }
 
 /// A church-defined service type / occurrence (replaces the fixed SS1, SS2,
@@ -2164,25 +2129,18 @@
   recurrence        String   @default("WEEKLY") // WEEKLY | MONTHLY | SELECTED_DATES | CUSTOM
   selectedDatesJson String   @default("[]")
   active            Boolean  @default(true)
-  effectiveFrom     DateTime @default(now())
-  effectiveTo       DateTime?
   musicRequired     Boolean  @default(false)
   protocolRequired  Boolean  @default(false)
   /// Maximum number of choirs allowed on one service instance (legacy: 3 for SS1/SS2).
   maxChoirs         Int      @default(3)
   /// Target Protocol team size for this service (legacy: 10).
   targetTeamSize    Int      @default(10)
-  /// The config version this row belongs to (snapshot integrity).
-  configVersionId   String?
-  configVersion     ConfigVersion? @relation(fields: [configVersionId], references: [id])
   displayOrder      Int      @default(0)
-  supersedesId      String?
   createdByPersonId String
   createdAt         DateTime @default(now())
 
-  @@unique([systemId, code, configVersionId])
   @@index([systemId, active])
-  @@index([configVersionId])
+  @@unique([systemId, code])
 }
 
 /// A category of choirs (replaces the fixed PRIMARY, SECONDARY, CHILDREN,
@@ -2195,18 +2153,11 @@
   name              String
   description       String   @default("")
   active            Boolean  @default(true)
-  effectiveFrom     DateTime @default(now())
-  effectiveTo       DateTime?
-  supersedesId      String?
   createdByPersonId String
   createdAt         DateTime @default(now())
-  /// The config version this row belongs to (snapshot integrity).
-  configVersionId   String?
-  configVersion     ConfigVersion? @relation(fields: [configVersionId], references: [id])
 
-  @@unique([systemId, code, configVersionId])
   @@index([systemId, active])
-  @@index([configVersionId])
+  @@unique([systemId, code])
 }
 
 /// Policy for one category × one service: eligibility + frequency target.
@@ -2228,19 +2179,12 @@
   maxCount          Int?
   /// If true, every eligible member of this category must be scheduled on the service (legacy: all Worship on Tuesday).
   requireAll        Boolean  @default(false)
-  /// The config version this row belongs to (snapshot integrity).
-  configVersionId   String?
-  configVersion     ConfigVersion? @relation(fields: [configVersionId], references: [id])
   fixedAssignments  MusicFixedAssignment[]
-  effectiveFrom     DateTime @default(now())
-  effectiveTo       DateTime?
-  supersedesId      String?
   createdByPersonId String
   createdAt         DateTime @default(now())
 
-  @@unique([systemId, categoryId, serviceId, configVersionId], map: "CategoryServicePolicy_config_version_key")
   @@index([systemId, categoryId])
-  @@index([configVersionId])
+  // One ACTIVE policy per (category, service): partial unique index CategoryServicePolicy_active_key (migration 0065).
 }
 
 /// Links a choir to a category, with optional per-choir eligibility / frequency overrides.
@@ -2252,25 +2196,17 @@
   eligibleOverrideJson String   @default("{}")       // { serviceCode: boolean }, scoped to this linked choir
   frequencyOverrideJson String  @default("{}")       // { serviceCode: { frequencyTarget, frequencyCounting, frequencyKind, frequencyPeriod } }
   active               Boolean  @default(true)
-  effectiveFrom        DateTime @default(now())
-  effectiveTo          DateTime?
-  supersedesId         String?
   createdByPersonId    String
   createdAt            DateTime @default(now())
-  /// The config version this row belongs to (snapshot integrity).
-  configVersionId      String?
-  configVersion        ConfigVersion? @relation(fields: [configVersionId], references: [id])
 
-  @@unique([systemId, choirId, configVersionId])
   @@index([systemId, categoryId])
-  @@index([configVersionId])
+  // One ACTIVE link per (choir, category): partial unique index ChoirCategoryLink_active_key (migration 0065).
 }
 
 /// Explicit choir designations used by FIXED category/service policies.
 model MusicFixedAssignment {
   id                       String   @id @default(cuid())
   systemId                 String
-  configVersionId          String
   categoryServicePolicyId  String
   choirId                  String
   serviceDate              String?
@@ -2279,12 +2215,11 @@
   displayOrder             Int      @default(0)
   createdByPersonId        String
   createdAt                DateTime @default(now())
-  configVersion            ConfigVersion @relation(fields: [configVersionId], references: [id])
   categoryServicePolicy   CategoryServicePolicy @relation(fields: [categoryServicePolicyId], references: [id])
 
   @@unique([systemId, categoryServicePolicyId, choirId, scopeKey], map: "MusicFixedAssignment_scope_key")
-  @@index([systemId, configVersionId])
   @@index([categoryServicePolicyId])
+  @@index([systemId])
 }
 
 /// Music-specific, date-scoped unavailability; serviceCode null means all services that date.
@@ -2317,17 +2252,10 @@
   requireChoir         Boolean  @default(true)
   requireWorship       Boolean  @default(true)
   relaxableKindsJson   String   @default("[]")
-  /// The config version this row belongs to (snapshot integrity).
-  configVersionId      String?
-  configVersion        ConfigVersion? @relation(fields: [configVersionId], references: [id])
-  effectiveFrom        DateTime @default(now())
-  effectiveTo          DateTime?
-  supersedesId         String?
   createdByPersonId    String
   createdAt            DateTime @default(now())
 
-  @@unique([systemId, serviceId, configVersionId])
-  @@index([configVersionId])
+  @@unique([systemId, serviceId])
 }
 
 /// Monthly Protocol duty policy (replaces the hard-coded target 3 / max 4 / team 10).
@@ -2342,19 +2270,10 @@
   musicCompatibilityRequired Boolean @default(true)
   leadershipPrioritiesJson String  @default("[]")
   exceptionsAllowed      Boolean  @default(true)
-  /// The config version this row belongs to (snapshot integrity).
-  configVersionId        String?
-  configVersion          ConfigVersion? @relation(fields: [configVersionId], references: [id])
-  effectiveFrom          DateTime @default(now())
-  effectiveTo            DateTime?
-  supersedesId           String?
   createdByPersonId      String
   createdAt              DateTime @default(now())
 
   @@index([systemId])
-  @@index([configVersionId])
+  @@unique([systemId])
 }
 
-/// Reverse relations from ConfigVersion to all config rows that belong to it.
-/// These enable snapshot reproducibility: given a ConfigVersion, find every
-/// service, category, policy, link, rule and duty policy that were part of it.
```

### `server/prisma/seed.ts (diff)`
_Seed writes live config, no versions or pin updates._

```diff
--- a/server/prisma/seed.ts
+++ b/server/prisma/seed.ts
@@ -591,7 +591,7 @@
   }
 
   // ─── Idempotent initial scheduling configuration (slice 3.17) ───
-  // Represents the verified legacy rules as versioned, tenant-scoped config.
+  // Represents the verified legacy rules as live, tenant-scoped config.
   // Rerunning the seed does not duplicate rows: every insert is guarded by an
   // existence check on the stable natural key (code, or system+category+service).
   try {
@@ -602,9 +602,8 @@
   }
 }
 
+/** Creates the initial live scheduling rows once. Never overwrites rows that already exist. */
 async function seedInitialSchedulingConfig(prisma: import('@prisma/client').PrismaClient): Promise<void> {
-  const now = new Date();
-
   // ── System tenants ──
   const MUSIC = 'sys-music';
   const PROTOCOL = 'sys-protocol';
@@ -617,51 +616,15 @@
   }
   const actorId = actorPosition.personId;
 
-  // ── ConfigVersion v1 (ACTIVE) ──
-  let version = await prisma.configVersion.findFirst({ where: { systemId: MUSIC, version: 1 } });
-  if (!version) {
-    version = await prisma.configVersion.create({
-      data: {
-        systemId: MUSIC,
-        version: 1,
-        label: 'Initial scheduling configuration (legacy rules)',
-        status: 'ACTIVE',
-        effectiveFrom: now,
-        createdByPersonId: actorId,
-        reason: 'Initial seed reproducing verified legacy Music and Protocol scheduling rules',
-        notesJson: JSON.stringify({ source: 'legacy-hard-coded', slice: '3.17' }),
-        validationJson: JSON.stringify({}),
-        affectedSchedulesJson: JSON.stringify([]),
-      },
-    });
-  }
-  let protocolVersion = await prisma.configVersion.findFirst({ where: { systemId: PROTOCOL, version: 1 } });
-  if (!protocolVersion) {
-    protocolVersion = await prisma.configVersion.create({
-      data: {
-        systemId: PROTOCOL,
-        version: 1,
-        label: 'Initial Protocol scheduling configuration (legacy rules)',
-        status: 'ACTIVE',
-        effectiveFrom: now,
-        createdByPersonId: actorId,
-        reason: 'Initial seed reproducing verified legacy Protocol scheduling rules',
-        notesJson: JSON.stringify({ source: 'legacy-hard-coded', slice: '3.17' }),
-        validationJson: JSON.stringify({}),
-        affectedSchedulesJson: JSON.stringify([]),
-      },
-    });
-  }
-
   // ── Shared scheduling calendar (owned once by Music) ──
   // Five service types from the legacy engine: SS1, SS2, TUESDAY, FRIDAY, IGABURO.
   // SS1, SS2, TUESDAY, IGABURO are used by both Music and Protocol. FRIDAY is Music-only.
   const services = [
-    { systemId: MUSIC, code: 'ss1', name: 'Sunday Service 1', kind: 'SERVICE', weekday: 0, time: '09:00', musicRequired: true, protocolRequired: true, maxChoirs: 3, configVersionId: version.id, displayOrder: 0 },
-    { systemId: MUSIC, code: 'ss2', name: 'Sunday Service 2', kind: 'SERVICE', weekday: 0, time: '11:00', musicRequired: true, protocolRequired: true, maxChoirs: 3, configVersionId: version.id, displayOrder: 1 },
-    { systemId: MUSIC, code: 'tuesday', name: 'Tuesday Service', kind: 'SERVICE', weekday: 2, time: '18:00', musicRequired: true, protocolRequired: true, maxChoirs: 3, configVersionId: version.id, displayOrder: 2 },
-    { systemId: MUSIC, code: 'friday', name: 'Friday Service', kind: 'SERVICE', weekday: 5, time: '18:00', musicRequired: true, protocolRequired: false, maxChoirs: 3, configVersionId: version.id, displayOrder: 3 },
-    { systemId: MUSIC, code: 'igaburo', name: 'Igaburo (Holy Communion)', kind: 'SERVICE', weekday: null, time: null, recurrence: 'MONTHLY', musicRequired: true, protocolRequired: true, maxChoirs: 3, configVersionId: version.id, displayOrder: 4 },
+    { systemId: MUSIC, code: 'ss1', name: 'Sunday Service 1', kind: 'SERVICE', weekday: 0, time: '09:00', musicRequired: true, protocolRequired: true, maxChoirs: 3, displayOrder: 0 },
+    { systemId: MUSIC, code: 'ss2', name: 'Sunday Service 2', kind: 'SERVICE', weekday: 0, time: '11:00', musicRequired: true, protocolRequired: true, maxChoirs: 3, displayOrder: 1 },
+    { systemId: MUSIC, code: 'tuesday', name: 'Tuesday Service', kind: 'SERVICE', weekday: 2, time: '18:00', musicRequired: true, protocolRequired: true, maxChoirs: 3, displayOrder: 2 },
+    { systemId: MUSIC, code: 'friday', name: 'Friday Service', kind: 'SERVICE', weekday: 5, time: '18:00', musicRequired: true, protocolRequired: false, maxChoirs: 3, displayOrder: 3 },
+    { systemId: MUSIC, code: 'igaburo', name: 'Igaburo (Holy Communion)', kind: 'SERVICE', weekday: null, time: null, recurrence: 'MONTHLY', musicRequired: true, protocolRequired: true, maxChoirs: 3, displayOrder: 4 },
   ];
   const serviceIds = new Map<string, string>();
   for (const s of services) {
@@ -674,7 +637,7 @@
         data: {
           ...s, systemId: s.systemId, code: s.code, name: s.name, kind: s.kind,
           weekday: s.weekday, time: s.time, recurrence: s.recurrence ?? 'WEEKLY',
-          selectedDatesJson: '[]', active: true, effectiveFrom: now,
+          selectedDatesJson: '[]', active: true,
           musicRequired: s.musicRequired, protocolRequired: s.protocolRequired,
           displayOrder: s.displayOrder, createdByPersonId: actorId,
         },
@@ -702,7 +665,7 @@
       const created = await prisma.choirCategory.create({
         data: {
           systemId: MUSIC, code: c.code, name: c.name, description: c.description,
-          active: true, effectiveFrom: now, configVersionId: version.id, createdByPersonId: actorId,
+          active: true, createdByPersonId: actorId,
         },
       });
       id = created.id;
@@ -762,8 +725,7 @@
           minCount: p.minCount ?? null,
           maxCount: p.maxCount ?? null,
           requireAll: p.requireAll ?? false,
-          configVersionId: version.id,
-          effectiveFrom: now, createdByPersonId: actorId,
+          createdByPersonId: actorId,
         },
       });
     }
@@ -781,7 +743,7 @@
   for (const r of protocolRuleRows) {
     const svcId = serviceIds.get(`${MUSIC}|${r.service}`);
     if (!svcId) continue;
-    const existing = await prisma.protocolServiceRule.findFirst({ where: { systemId: PROTOCOL, serviceId: svcId, configVersionId: protocolVersion.id } });
+    const existing = await prisma.protocolServiceRule.findFirst({ where: { systemId: PROTOCOL, serviceId: svcId } });
     if (!existing) {
       await prisma.protocolServiceRule.create({
         data: {
@@ -790,8 +752,7 @@
           required: r.required, defaultTeamSize: r.defaultTeamSize,
           teamSizeOverridesJson: '{}',
           requireChoir: r.requireChoir, requireWorship: r.requireWorship,
-          relaxableKindsJson: '[]', configVersionId: protocolVersion.id,
-          effectiveFrom: now, createdByPersonId: actorId,
+          relaxableKindsJson: '[]', createdByPersonId: actorId,
         },
       });
     }
@@ -799,7 +760,7 @@
 
   // ── Protocol duty policy ──
   // Legacy BASE_RULES: preferTarget=3, softMax=3, hardMax=4, defaultTeamSize=10.
-  const existingPolicy = await prisma.protocolDutyPolicy.findFirst({ where: { systemId: PROTOCOL, configVersionId: protocolVersion.id } });
+  const existingPolicy = await prisma.protocolDutyPolicy.findFirst({ where: { systemId: PROTOCOL } });
   if (!existingPolicy) {
       await prisma.protocolDutyPolicy.create({
         data: {
@@ -810,35 +771,12 @@
           musicCompatibilityRequired: true,
           leadershipPrioritiesJson: '[]',
           exceptionsAllowed: true,
-          configVersionId: protocolVersion.id,
-          effectiveFrom: now, createdByPersonId: actorId,
+          createdByPersonId: actorId,
         },
       });
   }
 
-  // Pin pre-versioned schedules to the seeded legacy-rule snapshots once.
-  await prisma.musicMonth.updateMany({
-    where: { configVersionId: null },
-    data: { configVersionId: version.id },
-  });
-  await prisma.musicDraft.updateMany({
-    where: { configVersionId: null },
-    data: { configVersionId: version.id },
-  });
-  await prisma.musicLog.updateMany({
-    where: { configVersionId: null },
-    data: { configVersionId: version.id },
-  });
-  await prisma.protocolPlan.updateMany({
-    where: { configVersionId: null },
-    data: { configVersionId: protocolVersion.id },
-  });
-  await prisma.protocolHistory.updateMany({
-    where: { configVersionId: null },
-    data: { configVersionId: protocolVersion.id },
-  });
-
-  console.log(`  scheduling config: version v1, ${services.length} services, ${categories.length} categories, ${policyRows.length} policies, ${protocolRuleRows.length} protocol rules, 1 duty policy`);
+  console.log(`  scheduling config (live): ${services.length} services, ${categories.length} categories, ${policyRows.length} policies, ${protocolRuleRows.length} protocol rules, 1 duty policy`);
 }
 
 main()
```

## 2. Validators

### `server/src/scheduling/validateForGeneration.ts`
_Pure snapshot validators; Music reuses validateMusicConfigSnapshot as the first pass._

```ts
/**
 * Can this configuration generate a schedule?
 *
 * Pure, self-contained and synchronous: no database, no I/O. Callers hand it a snapshot
 * (live rows, or live rows with a pending edit applied) and get `{ ok, errors }` back.
 * It is used in two places:
 *   1. `saveConfigChange` runs it on (live config + pending edit) and rejects the save with 422.
 *   2. The generate routes may call it as a last guard before building a schedule.
 *
 * Every message names the offending service, category or choir, and the list is de-duplicated.
 * The Music variant reuses `validateMusicConfigSnapshot` as its first pass, then adds the checks
 * that otherwise only surface as a thrown error inside the engine at generate time
 * (see the "engine throw sites" notes on each block).
 */

import { SUPPORTED_PROTOCOL_KINDS } from '../protocol/engine.js';
import {
  isMusicChoirEligible, validateMusicConfigSnapshot,
  type MusicConfigRulesSnapshot, type MusicLinkRules, type MusicPolicyRules,
} from './musicConfigRules.js';

export interface GenerationValidation { ok: boolean; errors: string[] }

/** The service fields the calendar builder reads. Widened versus the Music rules snapshot. */
export interface GenerationService {
  id: string;
  code: string;
  name: string;
  active: boolean;
  musicRequired: boolean;
  protocolRequired?: boolean;
  maxChoirs: number;
  weekday: number | null;
  time?: string | null;
  recurrence: string;
  selectedDates: string[];
}

export interface MusicGenerationSnapshot extends Omit<MusicConfigRulesSnapshot, 'services' | 'categories' | 'choirs'> {
  services: GenerationService[];
  categories: Array<{ id: string; active: boolean; code: string; name: string }>;
  choirs: Array<{ id: string; active: boolean; name: string }>;
}

export interface ProtocolGenerationSnapshot {
  /** The shared calendar (sys-music services). */
  services: GenerationService[];
  rules: Array<{ id?: string; serviceId: string; active: boolean; required: boolean; defaultTeamSize: number }>;
  dutyPolicy: { preferTarget: number; softMax: number; hardMax: number } | null;
}

const label = (s: { name: string; code: string }) => `${s.name} (${s.code})`;
const RECURRENCES = ['WEEKLY', 'MONTHLY', 'SELECTED_DATES', 'CUSTOM'];

/** A real calendar date written YYYY-MM-DD (rejects 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}

/** Calendar-field checks. Engine throw sites: buildConfiguredMusicCalendar (duplicate code, CUSTOM, WEEKLY). */
function calendarErrors(services: GenerationService[]): string[] {
  const errors: string[] = [];
  const active = services.filter((s) => s.active);
  const seen = new Map<string, GenerationService>();
  for (const s of active) {
    const key = s.code.toLowerCase();
    const first = seen.get(key);
    if (first) errors.push(`Two active services use the code ${s.code} (${first.name} and ${s.name}). Codes must be unique, ignoring capitalization.`);
    else seen.set(key, s);
  }
  for (const s of active) {
    if (!RECURRENCES.includes(s.recurrence)) {
      errors.push(`${label(s)} has an unknown recurrence “${s.recurrence}”.`);
      continue;
    }
    if (s.weekday !== null && !(Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6)) {
      errors.push(`${label(s)} has an invalid weekday.`);
    }
    if (s.time != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) {
      errors.push(`${label(s)} has an invalid start time. Use HH:MM.`);
    }
    for (const date of s.selectedDates) {
      if (!isIsoDate(date)) errors.push(`${label(s)} lists “${date}”, which is not a valid date. Use YYYY-MM-DD.`);
    }
    const hasDates = s.selectedDates.length > 0;
    if (s.recurrence === 'WEEKLY' && s.weekday === null) {
      errors.push(`${label(s)} repeats weekly, so it needs a weekday.`);
    }
    if (s.recurrence === 'CUSTOM' && !hasDates) {
      errors.push(`${label(s)} uses custom dates, so it needs at least one date.`);
    }
    if (s.recurrence === 'SELECTED_DATES' && !hasDates) {
      // The engine would silently produce no services for this one.
      errors.push(`${label(s)} uses selected dates, so it needs at least one date.`);
    }
    // The engine special-cases code IGABURO (no weekday = last Saturday of the month).
    if (s.recurrence === 'MONTHLY' && !hasDates && s.weekday === null && s.code.toUpperCase() !== 'IGABURO') {
      // The engine would silently produce no services for this one.
      errors.push(`${label(s)} repeats monthly, so it needs a weekday or specific dates.`);
    }
  }
  return errors;
}

export function validateForGeneration(snapshot: MusicGenerationSnapshot): GenerationValidation {
  // First pass: the existing rules (policy values, overrides, fixed arrangements, capacity).
  const errors: string[] = [...validateMusicConfigSnapshot(snapshot).errors];

  errors.push(...calendarErrors(snapshot.services));

  const activeChoirs = snapshot.choirs.filter((c) => c.active);
  const activeCategories = snapshot.categories.filter((c) => c.active);
  const categoryById = new Map(snapshot.categories.map((c) => [c.id, c]));
  const serviceById = new Map(snapshot.services.map((s) => [s.id, s]));
  const activeLinks = snapshot.links.filter((l) => l.active);
  const linksByChoir = new Map<string, MusicLinkRules[]>();
  for (const link of activeLinks) linksByChoir.set(link.choirId, [...(linksByChoir.get(link.choirId) ?? []), link]);
  const fixedChoirs = new Set(snapshot.fixedAssignments.map((f) => f.choirId));

  // Category codes are unique too (case-insensitive).
  const seenCategory = new Map<string, string>();
  for (const c of activeCategories) {
    const key = c.code.toLowerCase();
    const first = seenCategory.get(key);
    if (first) errors.push(`Two active categories use the code ${c.code} (${first} and ${c.name}).`);
    else seenCategory.set(key, c.name);
  }

  // Choir coverage. Engine throw site: configuredEngine "needs exactly one explicit choir-category link".
  for (const choir of activeChoirs) {
    const links = linksByChoir.get(choir.id) ?? [];
    if (links.length === 0 && !fixedChoirs.has(choir.id)) {
      errors.push(`${choir.name} is not linked to any category. Link it to exactly one category before generating.`);
    }
    for (const link of links) {
      const category = categoryById.get(link.categoryId);
      if (category && !category.active) errors.push(`${choir.name} is linked to ${category.name}, which is not active.`);
    }
  }

  // Category rule completeness. Engine throw site: configuredEngine "Add an active <category> rule for <service>".
  const activePolicies = snapshot.policies.filter((p) => p.active);
  for (const service of snapshot.services.filter((s) => s.active && s.musicRequired)) {
    for (const category of activeCategories) {
      const has = activePolicies.some((p) => p.serviceId === service.id && p.categoryId === category.id);
      if (!has) errors.push(`Add an active ${category.name} rule for ${service.name} (${service.code}).`);
    }
  }

  // Fixed designations must name a choir that is actually eligible, ignoring capitalization of exception codes.
  const policyById = new Map<string, MusicPolicyRules>(snapshot.policies.map((p) => [p.id, p]));
  for (const fixed of snapshot.fixedAssignments) {
    const policy = policyById.get(fixed.categoryServicePolicyId);
    const service = policy && serviceById.get(policy.serviceId);
    const choir = snapshot.choirs.find((c) => c.id === fixed.choirId);
    if (!policy || !service || !choir) continue; // dangling references are reported by the first pass
    const link = (linksByChoir.get(choir.id) ?? []).find((l) => l.categoryId === policy.categoryId) ?? null;
    if (!isMusicChoirEligible({ choirActive: choir.active, categoryId: policy.categoryId, serviceCode: service.code, policy, link })) {
      errors.push(`${choir.name} is designated for ${label(service)} but is not eligible for it.`);
    }
  }

  const unique = [...new Set(errors)];
  return { ok: unique.length === 0, errors: unique };
}

/**
 * Protocol variant. Same contract. `snapshot.services` is the shared calendar owned by Music.
 * Engine/route throw sites: UNSUPPORTED_SERVICE, PROTOCOL_RULE_MISSING, NO_PROTOCOL_CONFIG.
 */
export function validateProtocolForGeneration(snapshot: ProtocolGenerationSnapshot): GenerationValidation {
  const errors: string[] = [];
  const supported = SUPPORTED_PROTOCOL_KINDS as readonly string[];

  const policy = snapshot.dutyPolicy;
  if (!policy) {
    errors.push('Add the Protocol duty limits before building teams.');
  } else {
    for (const [name, value] of [['prefer target', policy.preferTarget], ['soft maximum', policy.softMax], ['hard maximum', policy.hardMax]] as const) {
      if (!Number.isInteger(value) || value <= 0) errors.push(`The Protocol duty ${name} must be a positive whole number.`);
    }
    if (policy.softMax < policy.preferTarget || policy.hardMax < policy.softMax) {
      errors.push('Protocol duty limits must satisfy prefer target ≤ soft maximum ≤ hard maximum.');
    }
  }

  const serviceById = new Map(snapshot.services.map((s) => [s.id, s]));
  const activeRules = snapshot.rules.filter((r) => r.active);

  const ruleCount = new Map<string, number>();
  for (const rule of activeRules) {
    const service = serviceById.get(rule.serviceId);
    if (!service) {
      errors.push('A Protocol team rule refers to a service that is no longer in the shared calendar.');
      continue;
    }
    ruleCount.set(rule.serviceId, (ruleCount.get(rule.serviceId) ?? 0) + 1);
    if (!Number.isInteger(rule.defaultTeamSize) || rule.defaultTeamSize <= 0) {
      errors.push(`The team size for ${label(service)} must be a positive whole number.`);
    }
  }
  for (const [serviceId, count] of ruleCount) {
    if (count > 1) errors.push(`${label(serviceById.get(serviceId)!)} has more than one Protocol team rule.`);
  }

  for (const service of snapshot.services.filter((s) => s.active && s.protocolRequired)) {
    if (!supported.includes(service.code.toUpperCase())) {
      errors.push(`Protocol is enabled for ${label(service)}, but the Protocol engine cannot staff that service code. Supported: ${supported.join(', ')}.`);
      continue;
    }
    if (!activeRules.some((r) => r.serviceId === service.id)) {
      errors.push(`Add Protocol team rules for ${label(service)}.`);
    }
  }

  const unique = [...new Set(errors)];
  return { ok: unique.length === 0, errors: unique };
}
```

### `server/src/scheduling/musicConfigRules.ts (diff)`
_Snapshot widened (weekday, recurrence, selectedDates, names); wording says live configuration._

```diff
--- a/server/src/scheduling/musicConfigRules.ts
+++ b/server/src/scheduling/musicConfigRules.ts
@@ -40,11 +40,12 @@
 }
 
 export interface MusicConfigRulesSnapshot {
-  services: Array<Pick<SchedulingServiceView, 'id' | 'code' | 'name' | 'active' | 'musicRequired' | 'maxChoirs'>>;
-  categories: Array<{ id: string; active: boolean }>;
+  services: Array<Pick<SchedulingServiceView, 'id' | 'code' | 'name' | 'active' | 'musicRequired' | 'maxChoirs'> &
+    Partial<Pick<SchedulingServiceView, 'weekday' | 'recurrence' | 'selectedDates'>>>;
+  categories: Array<{ id: string; active: boolean; code?: string; name?: string }>;
   policies: MusicPolicyRules[];
   links: MusicLinkRules[];
-  choirs: Array<{ id: string; active: boolean }>;
+  choirs: Array<{ id: string; active: boolean; name?: string }>;
   fixedAssignments: Array<{ categoryServicePolicyId: string; choirId: string; serviceDate?: string | null; serviceTime?: string | null }>;
 }
 
@@ -118,12 +119,12 @@
     const choirLinks = linksByChoir.get(link.choirId) ?? [];
     choirLinks.push(link);
     linksByChoir.set(link.choirId, choirLinks);
-    if (!categoryById.has(link.categoryId)) errors.push('A choir link refers to a category outside this configuration version.');
+    if (!categoryById.has(link.categoryId)) errors.push('A choir link refers to a category outside the live configuration.');
     if (!choirById.has(link.choirId)) errors.push('A choir link refers to a choir that no longer exists.');
     const eligibleOverrides = EligibleOverrideSchema.safeParse(link.eligibleOverride);
     const frequencyOverrides = FrequencyOverrideSchema.safeParse(link.frequencyOverride);
     if (!eligibleOverrides.success || !frequencyOverrides.success) {
-      errors.push('A choir has an invalid eligibility or frequency exception. Review its settings before activation.');
+      errors.push('A choir has an invalid eligibility or frequency exception. Review its settings before saving.');
       continue;
     }
     const serviceCodes = [...Object.keys(eligibleOverrides.data), ...Object.keys(frequencyOverrides.data)];
@@ -158,7 +159,7 @@
     }
   }
   for (const choirLinks of linksByChoir.values()) {
-    if (choirLinks.length > 1) errors.push('Each choir can belong to only one category in a configuration version.');
+    if (choirLinks.length > 1) errors.push('Each choir can belong to only one category in the live configuration.');
   }
 
   const fixedByPolicy = new Map<string, MusicConfigRulesSnapshot['fixedAssignments']>();
@@ -173,11 +174,11 @@
   for (const policy of snapshot.policies.filter((row) => row.active)) {
     const service = serviceById.get(policy.serviceId);
     if (!service) {
-      errors.push('A category rule refers to a service outside this configuration version.');
+      errors.push('A category rule refers to a service outside the live configuration.');
       continue;
     }
     if (!categoryById.has(policy.categoryId)) {
-      errors.push('A category rule refers to a category outside this configuration version.');
+      errors.push('A category rule refers to a category outside the live configuration.');
       continue;
     }
     if (!categoryById.get(policy.categoryId)?.active) {
```

### `server/src/protocol/engine.ts (diff)`
_Exports SUPPORTED_PROTOCOL_KINDS._

```diff
--- a/server/src/protocol/engine.ts
+++ b/server/src/protocol/engine.ts
@@ -17,6 +17,12 @@
   ProtocolTeamSlot,
 } from './types.js';
 
+/**
+ * The service codes the Protocol engine knows how to staff. Single source of truth: the engine,
+ * the Protocol routes and the generation validator all read this one list.
+ */
+export const SUPPORTED_PROTOCOL_KINDS = ['SS1', 'SS2', 'TUESDAY', 'IGABURO'] as const satisfies readonly ProtocolServiceKind[];
+
 /** personId → Music unit ids whose choir they belong to (empty = no choir). */
 export type ChoirUnitsByPerson = Map<string, Set<string>>;
 
@@ -596,11 +602,10 @@
 ): ProtocolSchedulingRules {
   const dp = dutyPolicy ?? { preferTarget: 3, softMax: 3, hardMax: 4, extraDutyPolicy: 'ALLOW_WHEN_SHORT' as const, leadershipPriorities: [] };
   const serviceRequirements: NonNullable<ProtocolSchedulingRules['serviceRequirements']> = {};
-  const protocolKinds: readonly ProtocolServiceKind[] = ['SS1', 'SS2', 'TUESDAY', 'IGABURO'];
   for (const rule of rules) {
     const service = services.find((candidate) => candidate.id === rule.serviceId);
     const kind = service?.code.toUpperCase() as ProtocolServiceKind | undefined;
-    if (!kind || !protocolKinds.includes(kind)) continue;
+    if (!kind || !SUPPORTED_PROTOCOL_KINDS.includes(kind)) continue;
     serviceRequirements[kind] = {
       choir: rule.requireChoir,
       worship: rule.requireWorship,
```

### `server/src/protocol/rules.ts (diff)`
_Duplicate KINDS removed._

```diff
--- a/server/src/protocol/rules.ts
+++ b/server/src/protocol/rules.ts
@@ -11,7 +11,7 @@
 export const OFFICES = ['PRESIDENT', 'VP', 'SECRETARY', 'TREASURER', 'COORDINATOR', 'MEMBER'] as const;
 export const SERVE_DAYS = ['SUNDAY', 'TUESDAY', 'BOTH'] as const;
 export const ROSTER_STATUS = ['ACTIVE', 'INACTIVE', 'LEAVE'] as const;
-export const KINDS = ['SS1', 'SS2', 'TUESDAY', 'IGABURO'] as const;
+// KINDS moved to protocol/engine.ts as SUPPORTED_PROTOCOL_KINDS (single source of truth).
 export const ATTENDANCE = ['PRESENT', 'HALF_PRESENT', 'EXCUSED', 'ABSENT'] as const;
 export const REASON_MIN = 5;
 export const REASON_MAX = 300;
```

## 3. `saveConfigChange` (the only write path)

### `server/src/scheduling/saveConfigChange.ts`
_Order: permission 403, lock 409, apply to clone 400/404/409, validate 422, one transaction (writes, audit, lock refresh)._

```ts
/**
 * THE one write path for scheduling configuration.
 *
 * Every mutating route in configRouter.ts calls `saveConfigChange`. Nothing else writes config rows
 * (choirRegisterSync only ADDS a missing choir link, see its header). The order is fixed:
 *
 *   1. tenant + SCHEDULING W check          -> 403
 *   2. edit-lock check (caller must hold it) -> 409 { error: 'LOCKED', holder }
 *   3. apply the change to an in-memory copy of the LIVE config (reference checks -> 400/404/409)
 *   4. validate the result with validateForGeneration / validateProtocolForGeneration -> 422 { errors }
 *   5. write rows + audit entry + refresh the lock, in one transaction
 *
 * Validation gates the SAVE. "Valid" means: the edit introduces no error that the live config did not
 * already have. When the live config is clean this is exactly "the result must be valid". When the live
 * config is already broken (for example data from before these checks existed) it still lets people repair it
 * one edit at a time instead of locking everyone out. TODO(confirm): the literal reading is "reject if the
 * result has any error"; the conservative-for-operations choice is taken here and noted in the handover.
 *
 * Batches: `change.ops` is applied atomically (all rows or none), and validated once at the end. That is what
 * makes multi-row edits possible, since a lone intermediate row can be invalid on its own.
 *
 * Implied rules: adding an active category or a Music-required service needs one rule per pair before the
 * calendar can generate. The save adds those rules itself, as ineligible defaults, inside the same
 * transaction, so a single "add category" is valid by construction. The leader then sets the real rules.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { loadAccessData } from '../notifications/feed.js';
import { buildMusicCalendar } from '../music/engine.js';
import { checkEditLock, LOCK_TTL_MS, type LockHolder } from './editLock.js';
import { canWriteConfig } from './rules.js';
import { isMusicChoirEligible, validatePolicyValues } from './musicConfigRules.js';
import { toCategoryView, toDutyPolicyView, toLinkView, toPolicyView, toRuleView, toServiceView } from './store.js';
import { parseJson, stringifyJson } from './types.js';
import {
  validateForGeneration, validateProtocolForGeneration,
  type GenerationValidation,
} from './validateForGeneration.js';

export const MUSIC_SYSTEM = 'sys-music';
export const PROTOCOL_SYSTEM = 'sys-protocol';

/* ─── Public types ─── */

export type ConfigOp =
  | { op: 'service.create'; data: ServiceInput }
  | { op: 'service.update'; id: string; patch: Partial<ServiceInput> }
  | { op: 'service.retire'; id: string }
  | { op: 'category.create'; data: CategoryInput }
  | { op: 'category.update'; id: string; patch: Partial<CategoryInput> }
  | { op: 'policy.create'; data: PolicyInput }
  | { op: 'policy.update'; id: string; patch: Partial<PolicyInput> }
  | { op: 'link.create'; data: LinkInput }
  | { op: 'link.update'; id: string; patch: Partial<LinkInput> }
  | { op: 'fixed.create'; data: FixedInput }
  | { op: 'fixed.delete'; id: string }
  | { op: 'availability.add'; data: AvailabilityInput }
  | { op: 'availability.clear'; id: string }
  | { op: 'rule.create'; data: RuleInput }
  | { op: 'rule.update'; id: string; patch: Partial<RuleInput> }
  | { op: 'duty.create'; data: DutyInput }
  | { op: 'duty.update'; id: string; patch: Partial<DutyInput> };

export interface ServiceInput {
  code: string; name: string; kind?: string; weekday?: number | null; time?: string | null; recurrence?: string;
  selectedDates?: string[]; active?: boolean; musicRequired?: boolean; protocolRequired?: boolean;
  maxChoirs?: number; displayOrder?: number;
}
export interface CategoryInput { code: string; name: string; description?: string; active?: boolean }
export interface PolicyInput {
  categoryId: string; serviceId: string; eligible?: boolean; active?: boolean; frequencyTarget?: number | null;
  frequencyCounting?: string; frequencyKind?: string; frequencyPeriod?: string | null; planningMode?: string;
  minCount?: number | null; maxCount?: number | null; requireAll?: boolean;
}
export interface LinkInput {
  choirId: string; categoryId: string; eligibleOverride?: Record<string, boolean>;
  frequencyOverride?: Record<string, FrequencyOverride>; active?: boolean;
}
type FrequencyOverride = {
  frequencyTarget?: number; frequencyCounting?: 'ASSIGNMENTS' | 'DISTINCT_DATES';
  frequencyKind?: 'MINIMUM' | 'TARGET' | 'MAXIMUM'; frequencyPeriod?: 'MONTH' | 'QUARTER' | 'HALF_YEAR' | 'YEAR';
};
export interface FixedInput {
  categoryServicePolicyId?: string; serviceId?: string; serviceDate?: string | null; serviceTime?: string | null;
  choirId: string; displayOrder?: number;
}
export interface AvailabilityInput {
  choirId: string; fromDate: string; toDate: string; serviceCode?: string | null; reason?: string | null;
}
export interface RuleInput {
  serviceId: string; active?: boolean; required?: boolean; defaultTeamSize?: number;
  teamSizeOverrides?: Record<string, number>; requireChoir?: boolean; requireWorship?: boolean; relaxableKinds?: string[];
}
export interface DutyInput {
  preferTarget?: number; softMax?: number; hardMax?: number; extraDutyPolicy?: 'ALLOW_WHEN_SHORT' | 'NEVER' | 'ALWAYS';
  duplicateSameDayAllowed?: boolean; musicCompatibilityRequired?: boolean; leadershipPriorities?: string[];
  exceptionsAllowed?: boolean;
}

export interface ConfigChange { ops: ConfigOp[] }

export interface ChangeResult {
  op: ConfigOp['op'] | 'policy.implied';
  status: 'CREATED' | 'UPDATED' | 'DELETED' | 'EXISTS';
  row: unknown;
}

/** Thrown for every refusal. The router turns it into the HTTP response unchanged. */
export class ConfigError extends Error {
  constructor(public readonly status: number, public readonly body: Record<string, unknown>) {
    super(String(body.error ?? body.message ?? 'Configuration change refused'));
  }
}
const refuse = (status: number, code: string, error: string) => new ConfigError(status, { error, code });

/* ─── Working state ─── */

type Row = Record<string, any>;
interface State {
  system: string;
  services: Row[]; categories: Row[]; policies: Row[]; links: Row[]; fixed: Row[]; choirs: Row[];
  rules: Row[]; duty: Row[]; unavailability: Row[];
}
interface Write { model: string; kind: 'create' | 'update' | 'delete'; id?: string; data?: Row }
interface Audit { action: string; detail: string; meta: object }

async function loadState(system: string): Promise<State> {
  if (system === MUSIC_SYSTEM) {
    const [services, categories, policies, links, fixed, choirs, unavailability] = await Promise.all([
      prisma.schedulingService.findMany({ where: { systemId: MUSIC_SYSTEM } }),
      prisma.choirCategory.findMany({ where: { systemId: MUSIC_SYSTEM } }),
      prisma.categoryServicePolicy.findMany({ where: { systemId: MUSIC_SYSTEM } }),
      prisma.choirCategoryLink.findMany({ where: { systemId: MUSIC_SYSTEM } }),
      prisma.musicFixedAssignment.findMany({ where: { systemId: MUSIC_SYSTEM } }),
      prisma.musicChoir.findMany(),
      prisma.musicChoirUnavailability.findMany({ where: { systemId: MUSIC_SYSTEM, active: true } }),
    ]);
    return { system, services, categories, policies, links, fixed, choirs, rules: [], duty: [], unavailability } as State;
  }
  const [services, rules, duty] = await Promise.all([
    prisma.schedulingService.findMany({ where: { systemId: MUSIC_SYSTEM } }),
    prisma.protocolServiceRule.findMany({ where: { systemId: PROTOCOL_SYSTEM } }),
    prisma.protocolDutyPolicy.findMany({ where: { systemId: PROTOCOL_SYSTEM } }),
  ]);
  return { system, services, categories: [], policies: [], links: [], fixed: [], choirs: [], rules, duty, unavailability: [] } as State;
}

const cloneState = (s: State): State => ({
  ...s,
  services: s.services.map((r) => ({ ...r })), categories: s.categories.map((r) => ({ ...r })),
  policies: s.policies.map((r) => ({ ...r })), links: s.links.map((r) => ({ ...r })),
  fixed: s.fixed.map((r) => ({ ...r })), choirs: s.choirs, rules: s.rules.map((r) => ({ ...r })),
  duty: s.duty.map((r) => ({ ...r })), unavailability: s.unavailability.map((r) => ({ ...r })),
});

export function validateState(s: State): GenerationValidation {
  const services = s.services.map(toServiceView);
  if (s.system === MUSIC_SYSTEM) {
    return validateForGeneration({
      services,
      categories: s.categories.map((c) => ({ id: c.id, active: c.active, code: c.code, name: c.name })),
      policies: s.policies.map(toPolicyView),
      links: s.links.map(toLinkView),
      choirs: s.choirs.map((c) => ({ id: c.id, active: c.active, name: c.name })),
      fixedAssignments: s.fixed.map((f) => ({ categoryServicePolicyId: f.categoryServicePolicyId, choirId: f.choirId, serviceDate: f.serviceDate, serviceTime: f.serviceTime })),
    });
  }
  const duty = s.duty[0] ? toDutyPolicyView(s.duty[0]) : null;
  return validateProtocolForGeneration({
    services,
    rules: s.rules.map(toRuleView),
    dutyPolicy: duty ? { preferTarget: duty.preferTarget, softMax: duty.softMax, hardMax: duty.hardMax } : null,
  });
}

/* ─── Field conversion (the same function builds the DB patch and updates the in-memory row) ─── */

const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const serviceFields = (p: Partial<ServiceInput>) => defined({
  code: p.code, name: p.name, kind: p.kind, weekday: p.weekday, time: p.time, recurrence: p.recurrence,
  selectedDatesJson: p.selectedDates === undefined ? undefined : stringifyJson(p.selectedDates),
  active: p.active, musicRequired: p.musicRequired, protocolRequired: p.protocolRequired,
  maxChoirs: p.maxChoirs, displayOrder: p.displayOrder,
});
const categoryFields = (p: Partial<CategoryInput>) => defined({ code: p.code, name: p.name, description: p.description, active: p.active });
const policyFields = (p: Partial<PolicyInput>) => defined({
  categoryId: p.categoryId, serviceId: p.serviceId, eligible: p.eligible, active: p.active, frequencyTarget: p.frequencyTarget,
  frequencyCounting: p.frequencyCounting, frequencyKind: p.frequencyKind, frequencyPeriod: p.frequencyPeriod,
  planningMode: p.planningMode, minCount: p.minCount, maxCount: p.maxCount, requireAll: p.requireAll,
});
const linkFields = (p: Partial<LinkInput>) => defined({
  choirId: p.choirId, categoryId: p.categoryId, active: p.active,
  eligibleOverrideJson: p.eligibleOverride === undefined ? undefined : stringifyJson(p.eligibleOverride),
  frequencyOverrideJson: p.frequencyOverride === undefined ? undefined : stringifyJson(p.frequencyOverride),
});
const ruleFields = (p: Partial<RuleInput>) => defined({
  serviceId: p.serviceId, active: p.active, required: p.required, defaultTeamSize: p.defaultTeamSize,
  teamSizeOverridesJson: p.teamSizeOverrides === undefined ? undefined : stringifyJson(p.teamSizeOverrides),
  requireChoir: p.requireChoir, requireWorship: p.requireWorship,
  relaxableKindsJson: p.relaxableKinds === undefined ? undefined : JSON.stringify(p.relaxableKinds),
});
const dutyFields = (p: Partial<DutyInput>) => defined({
  preferTarget: p.preferTarget, softMax: p.softMax, hardMax: p.hardMax, extraDutyPolicy: p.extraDutyPolicy,
  duplicateSameDayAllowed: p.duplicateSameDayAllowed, musicCompatibilityRequired: p.musicCompatibilityRequired,
  leadershipPrioritiesJson: p.leadershipPriorities === undefined ? undefined : JSON.stringify(p.leadershipPriorities),
  exceptionsAllowed: p.exceptionsAllowed,
});

/* ─── Applying one op ─── */

interface Ctx { state: State; me: string; writes: Write[]; audits: Audit[]; results: ChangeResult[] }

function insert(ctx: Ctx, key: keyof State, model: string, row: Row) {
  (ctx.state[key] as Row[]).push(row);
  ctx.writes.push({ model, kind: 'create', data: row });
}
function modify(ctx: Ctx, model: string, row: Row, patch: Row) {
  Object.assign(row, patch);
  if (Object.keys(patch).length) ctx.writes.push({ model, kind: 'update', id: row.id, data: patch });
}
function remove(ctx: Ctx, key: keyof State, model: string, row: Row) {
  const list = ctx.state[key] as Row[];
  list.splice(list.indexOf(row), 1);
  ctx.writes.push({ model, kind: 'delete', id: row.id });
}
const stamp = (ctx: Ctx) => ({ id: randomUUID(), createdByPersonId: ctx.me, createdAt: new Date() });

/** Ineligible, empty rule for one category x service pair: valid on its own, edited by the leader afterwards. */
function defaultPolicy(ctx: Ctx, categoryId: string, serviceId: string): Row {
  return {
    ...stamp(ctx), systemId: MUSIC_SYSTEM, categoryId, serviceId, eligible: false, active: true,
    frequencyTarget: null, frequencyCounting: 'ASSIGNMENTS', frequencyKind: 'TARGET', frequencyPeriod: null,
    planningMode: 'ROTATION', minCount: null, maxCount: null, requireAll: false,
  };
}

/** Make sure every active category has a rule for every active Music-required service (implied rules). */
function fillImpliedPolicies(ctx: Ctx) {
  const s = ctx.state;
  if (s.system !== MUSIC_SYSTEM) return;
  for (const service of s.services.filter((r) => r.active && r.musicRequired)) {
    for (const category of s.categories.filter((r) => r.active)) {
      const rows = s.policies.filter((p) => p.serviceId === service.id && p.categoryId === category.id);
      if (rows.some((p) => p.active)) continue;
      if (rows[0]) { // reactivate the old rule rather than leave a hole or duplicate it
        modify(ctx, 'categoryServicePolicy', rows[0], { active: true });
      } else {
        const row = defaultPolicy(ctx, category.id, service.id);
        insert(ctx, 'policies', 'categoryServicePolicy', row);
        ctx.results.push({ op: 'policy.implied', status: 'CREATED', row: toPolicyView(row) });
      }
      ctx.audits.push({ action: 'POLICY_CREATED', detail: `Added a default rule for ${category.name} × ${service.name}`, meta: { implied: true, categoryId: category.id, serviceId: service.id } });
    }
  }
}

const byId = (rows: Row[], id: string) => rows.find((r) => r.id === id);
const activeLinkFor = (s: State, choirId: string) => s.links.filter((l) => l.active && l.choirId === choirId);

/** Port of the old validateLinkOverrides, now against the live in-memory config. Returns a message or null. */
function overrideProblem(s: State, categoryId: string, eligibleOverride: Record<string, boolean>, frequencyOverride: Record<string, FrequencyOverride>): string | null {
  const serviceByCode = new Map(s.services.map((r) => [String(r.code).toLowerCase(), r]));
  const policyByService = new Map(s.policies.filter((p) => p.active && p.categoryId === categoryId).map((p) => [p.serviceId, p]));
  for (const overrides of [eligibleOverride, frequencyOverride] as Array<Record<string, unknown>>) {
    const seen = new Set<string>();
    for (const code of Object.keys(overrides)) {
      const key = code.toLowerCase();
      if (seen.has(key)) return `The override for service ${code} is repeated with different capitalization.`;
      seen.add(key);
    }
  }
  for (const code of [...Object.keys(eligibleOverride), ...Object.keys(frequencyOverride)]) {
    const service = serviceByCode.get(code.toLowerCase());
    if (!service) return `The override refers to service ${code}, which is not in the configuration.`;
    if (!policyByService.get(service.id)) return `Add an active category rule for ${service.name} before adding a choir override.`;
  }
  for (const [code, override] of Object.entries(frequencyOverride)) {
    const service = serviceByCode.get(code.toLowerCase())!;
    const policy = policyByService.get(service.id)!;
    const target = override.frequencyTarget ?? policy.frequencyTarget;
    const period = override.frequencyPeriod ?? policy.frequencyPeriod;
    if (target === null || target === undefined) return `The frequency override for ${service.name} needs a positive frequency target.`;
    if (!period) return `Choose a period for the frequency override on ${service.name}.`;
    const errors = validatePolicyValues({
      eligible: policy.eligible, frequencyTarget: target,
      frequencyCounting: override.frequencyCounting ?? policy.frequencyCounting,
      frequencyKind: override.frequencyKind ?? policy.frequencyKind, frequencyPeriod: period,
      planningMode: policy.planningMode, minCount: policy.minCount, maxCount: policy.maxCount, requireAll: policy.requireAll,
    });
    if (errors.length) return errors[0]!;
  }
  return null;
}

const needSystem = (ctx: Ctx, system: string, what: string) => {
  if (ctx.state.system !== system) throw refuse(400, 'BAD_INPUT', `${what} belong to ${system}`);
};
const exists = (ctx: Ctx, op: ChangeResult['op'], row: Row, view: (r: Row) => unknown, action: string, detail: string, meta: object) => {
  ctx.results.push({ op, status: 'EXISTS', row: view(row) });
  ctx.audits.push({ action, detail, meta });
};

function applyOp(ctx: Ctx, change: ConfigOp) {
  const s = ctx.state;
  switch (change.op) {
    /* Services (the shared calendar, owned by Music) */
    case 'service.create': {
      needSystem(ctx, MUSIC_SYSTEM, 'Shared calendar services');
      const d = change.data;
      const same = s.services.find((r) => String(r.code).toLowerCase() === d.code.toLowerCase());
      if (same) return exists(ctx, change.op, same, toServiceView, 'SERVICE_EXISTS', `Service ${d.code} already exists`, { serviceId: same.id });
      const row = {
        ...stamp(ctx), systemId: MUSIC_SYSTEM, kind: 'SERVICE', weekday: null, time: null, recurrence: 'WEEKLY',
        selectedDatesJson: '[]', active: true, musicRequired: false, protocolRequired: false, maxChoirs: 3,
        targetTeamSize: 10, displayOrder: 0, ...serviceFields(d),
      };
      insert(ctx, 'services', 'schedulingService', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row: toServiceView(row) });
      ctx.audits.push({ action: 'SERVICE_CREATED', detail: `Created service “${d.name}” (${d.code})`, meta: { serviceId: row.id } });
      return;
    }
    case 'service.update': {
      needSystem(ctx, MUSIC_SYSTEM, 'Shared calendar services');
      const row = byId(s.services, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Service not found');
      const p = change.patch;
      if (p.code && p.code.toLowerCase() !== String(row.code).toLowerCase() && s.services.some((r) => r.id !== row.id && String(r.code).toLowerCase() === p.code!.toLowerCase())) {
        throw refuse(409, 'DUPLICATE', 'That service code is already used');
      }
      modify(ctx, 'schedulingService', row, serviceFields(p));
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toServiceView(row) });
      ctx.audits.push({ action: 'SERVICE_UPDATED', detail: `Updated service “${row.name}” (${row.code})`, meta: { serviceId: row.id } });
      return;
    }
    case 'service.retire': {
      needSystem(ctx, MUSIC_SYSTEM, 'Shared calendar services');
      const row = byId(s.services, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Service not found');
      modify(ctx, 'schedulingService', row, { active: false });
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toServiceView(row) });
      ctx.audits.push({ action: 'SERVICE_RETIRED', detail: `Retired service “${row.name}” (${row.code})`, meta: { serviceId: row.id } });
      return;
    }
    /* Categories */
    case 'category.create': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir categories');
      const d = change.data;
      const same = s.categories.find((r) => String(r.code).toLowerCase() === d.code.toLowerCase());
      if (same) return exists(ctx, change.op, same, toCategoryView, 'CATEGORY_EXISTS', `Category ${d.code} already exists`, { categoryId: same.id });
      const row = { ...stamp(ctx), systemId: MUSIC_SYSTEM, description: '', active: true, ...categoryFields(d) };
      insert(ctx, 'categories', 'choirCategory', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row: toCategoryView(row) });
      ctx.audits.push({ action: 'CATEGORY_CREATED', detail: `Created category “${d.name}” (${d.code})`, meta: { categoryId: row.id } });
      return;
    }
    case 'category.update': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir categories');
      const row = byId(s.categories, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Category not found');
      const p = change.patch;
      if (p.code && p.code.toLowerCase() !== String(row.code).toLowerCase() && s.categories.some((r) => r.id !== row.id && String(r.code).toLowerCase() === p.code!.toLowerCase())) {
        throw refuse(409, 'DUPLICATE', 'That category code is already used');
      }
      modify(ctx, 'choirCategory', row, categoryFields(p));
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toCategoryView(row) });
      ctx.audits.push({ action: 'CATEGORY_UPDATED', detail: `Updated category “${row.name}” (${row.code})`, meta: { categoryId: row.id } });
      return;
    }
    /* Category x service policies */
    case 'policy.create': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir policies');
      const d = change.data;
      if (!s.categories.some((r) => r.id === d.categoryId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir category');
      if (!s.services.some((r) => r.id === d.serviceId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active service');
      const same = s.policies.find((p) => p.active && p.categoryId === d.categoryId && p.serviceId === d.serviceId);
      if (same) return exists(ctx, change.op, same, toPolicyView, 'POLICY_EXISTS', `Policy for ${d.categoryId} × ${d.serviceId} already exists`, { policyId: same.id });
      const row = { ...defaultPolicy(ctx, d.categoryId, d.serviceId), eligible: true, ...policyFields(d) };
      insert(ctx, 'policies', 'categoryServicePolicy', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row: toPolicyView(row) });
      ctx.audits.push({ action: 'POLICY_CREATED', detail: `Created policy ${d.categoryId} × ${d.serviceId}`, meta: { policyId: row.id } });
      return;
    }
    case 'policy.update': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir policies');
      const row = byId(s.policies, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Policy not found');
      const categoryId = change.patch.categoryId ?? row.categoryId;
      const serviceId = change.patch.serviceId ?? row.serviceId;
      if (!s.categories.some((r) => r.id === categoryId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir category');
      if (!s.services.some((r) => r.id === serviceId)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose a service in the calendar');
      const willBeActive = change.patch.active ?? row.active;
      if (willBeActive && s.policies.some((p) => p.id !== row.id && p.active && p.categoryId === categoryId && p.serviceId === serviceId)) {
        throw refuse(409, 'DUPLICATE', 'That category and service already have a rule');
      }
      modify(ctx, 'categoryServicePolicy', row, policyFields(change.patch));
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toPolicyView(row) });
      ctx.audits.push({ action: 'POLICY_UPDATED', detail: `Updated policy for ${categoryId} × ${serviceId}`, meta: { policyId: row.id } });
      return;
    }
    /* Choir <-> category links */
    case 'link.create': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir category links');
      const d = change.data;
      if (!s.categories.some((r) => r.id === d.categoryId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir category');
      if (!s.choirs.some((c) => c.id === d.choirId && c.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir');
      const problem = overrideProblem(s, d.categoryId, d.eligibleOverride ?? {}, d.frequencyOverride ?? {});
      if (problem) throw refuse(400, 'CONFIG_OVERRIDE', problem);
      const current = activeLinkFor(s, d.choirId)[0];
      if (current) {
        if (current.categoryId !== d.categoryId) throw refuse(409, 'DUPLICATE_MEMBERSHIP', 'Each choir can belong to only one category.');
        return exists(ctx, change.op, current, toLinkView, 'LINK_EXISTS', `Link for choir ${d.choirId} already exists`, { linkId: current.id });
      }
      const row = { ...stamp(ctx), systemId: MUSIC_SYSTEM, active: true, eligibleOverrideJson: '{}', frequencyOverrideJson: '{}', ...linkFields(d) };
      insert(ctx, 'links', 'choirCategoryLink', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row: toLinkView(row) });
      ctx.audits.push({ action: 'LINK_CREATED', detail: `Linked choir ${d.choirId} to category ${d.categoryId}`, meta: { linkId: row.id } });
      return;
    }
    case 'link.update': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir category links');
      const row = byId(s.links, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Choir category link not found');
      const categoryId = change.patch.categoryId ?? row.categoryId;
      const choirId = change.patch.choirId ?? row.choirId;
      if (!s.categories.some((r) => r.id === categoryId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir category');
      if (!s.choirs.some((c) => c.id === choirId && c.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir');
      if ((change.patch.active ?? row.active) && s.links.some((l) => l.id !== row.id && l.active && l.choirId === choirId)) {
        throw refuse(409, 'DUPLICATE_MEMBERSHIP', 'Each choir can belong to only one category.');
      }
      const eligible = change.patch.eligibleOverride ?? parseJson(row.eligibleOverrideJson, {});
      const frequency = change.patch.frequencyOverride ?? parseJson(row.frequencyOverrideJson, {});
      const problem = overrideProblem(s, categoryId, eligible, frequency);
      if (problem) throw refuse(400, 'CONFIG_OVERRIDE', problem);
      modify(ctx, 'choirCategoryLink', row, linkFields(change.patch));
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toLinkView(row) });
      ctx.audits.push({ action: 'LINK_UPDATED', detail: `Updated choir category link for ${choirId}`, meta: { linkId: row.id } });
      return;
    }
    /* Fixed designations */
    case 'fixed.create': {
      needSystem(ctx, MUSIC_SYSTEM, 'Fixed choir assignments');
      const b = change.data;
      const choirLink = activeLinkFor(s, b.choirId)[0];
      if (!b.categoryServicePolicyId && (!b.serviceId || !choirLink)) {
        throw refuse(400, 'CONFIG_REFERENCE', 'Choose a service and a choir linked to a category.');
      }
      const policy = s.policies.find((p) => p.active && (b.categoryServicePolicyId
        ? p.id === b.categoryServicePolicyId
        : p.serviceId === b.serviceId && p.categoryId === choirLink!.categoryId));
      if (!policy) throw refuse(400, 'CONFIG_REFERENCE', 'The selected service needs an active rule for this choir’s category.');
      const service = s.services.find((r) => r.id === policy.serviceId && r.active);
      const choir = s.choirs.find((c) => c.id === b.choirId && c.active);
      const link = s.links.find((l) => l.active && l.choirId === b.choirId && l.categoryId === policy.categoryId);
      if (!service || !choir || !link) throw refuse(400, 'CONFIG_REFERENCE', 'The designated choir must be active and linked to this rule’s category.');
      if (b.serviceTime && b.serviceTime !== service.time) throw refuse(400, 'CONFIG_REFERENCE', 'Choose the selected service’s configured start time.');
      if (b.serviceDate && !buildMusicCalendar(b.serviceDate.slice(0, 7), 'MONTH', [toServiceView(service)]).some((slot) => slot.date === b.serviceDate)) {
        throw refuse(400, 'CONFIG_REFERENCE', 'This service does not occur on that date. Add the date to the service calendar first.');
      }
      // Case-insensitive exception lookup (the old route compared exception codes case-sensitively).
      if (!isMusicChoirEligible({ choirActive: true, categoryId: policy.categoryId, serviceCode: service.code, policy, link: toLinkView(link) })) {
        throw refuse(400, 'CONFIG_INELIGIBLE', 'This choir is not eligible for the selected service.');
      }
      const scopeKey = !b.serviceDate && !b.serviceTime ? 'ALL' : `${b.serviceDate ?? '*'}|${b.serviceTime ?? '*'}`;
      const same = s.fixed.find((f) => f.categoryServicePolicyId === policy.id && f.choirId === b.choirId && f.scopeKey === scopeKey);
      if (same) return exists(ctx, change.op, same, (r) => r, 'MUSIC_FIXED_ASSIGNMENT_EXISTS', 'Fixed designation already exists', { assignmentId: same.id });
      if (policy.maxCount !== null && !b.serviceDate && !b.serviceTime) {
        const count = s.fixed.filter((f) => f.categoryServicePolicyId === policy.id && !f.serviceDate && !f.serviceTime).length;
        if (count + 1 > policy.maxCount) throw refuse(409, 'SERVICE_LIMIT', 'This would exceed the category’s maximum choir count.');
      }
      const peers = s.policies.filter((p) => p.serviceId === policy.serviceId && p.id !== policy.id).map((p) => p.id);
      if (s.fixed.some((f) => f.choirId === b.choirId && peers.includes(f.categoryServicePolicyId))) {
        throw refuse(409, 'DUPLICATE_SERVICE_ASSIGNMENT', 'A choir cannot fill two categories on the same service.');
      }
      const row = {
        ...stamp(ctx), systemId: MUSIC_SYSTEM, categoryServicePolicyId: policy.id, choirId: b.choirId,
        displayOrder: b.displayOrder ?? 0, serviceDate: b.serviceDate ?? null, serviceTime: b.serviceTime ?? null, scopeKey,
      };
      insert(ctx, 'fixed', 'musicFixedAssignment', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row });
      ctx.audits.push({ action: 'MUSIC_FIXED_ASSIGNMENT_CREATED', detail: `Designated a choir for ${service.name}`, meta: { assignmentId: row.id, policyId: policy.id, choirId: b.choirId } });
      return;
    }
    case 'fixed.delete': {
      needSystem(ctx, MUSIC_SYSTEM, 'Fixed choir assignments');
      const row = byId(s.fixed, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Fixed choir assignment not found.');
      remove(ctx, 'fixed', 'musicFixedAssignment', row);
      ctx.results.push({ op: change.op, status: 'DELETED', row });
      ctx.audits.push({ action: 'MUSIC_FIXED_ASSIGNMENT_REMOVED', detail: 'Removed a fixed choir designation', meta: { assignmentId: row.id, choirId: row.choirId } });
      return;
    }
    /* Availability (live and unversioned before this change too; same semantics, now behind the one write path) */
    case 'availability.add': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir availability records');
      const b = change.data;
      if (b.toDate < b.fromDate) throw refuse(400, 'BAD_INPUT', 'Choose a valid From and To date; To cannot be before From.');
      if (!s.choirs.some((c) => c.id === b.choirId && c.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir.');
      if (b.serviceCode && !s.services.some((r) => r.active && r.musicRequired && String(r.code).toLowerCase() === b.serviceCode!.toLowerCase())) {
        throw refuse(400, 'CONFIG_REFERENCE', 'Choose a service from the Music calendar.');
      }
      const clash = s.unavailability.some((r) => r.choirId === b.choirId && r.serviceDate <= b.toDate && (r.endDate ?? r.serviceDate) >= b.fromDate
        && (r.serviceCode === null || !b.serviceCode || String(r.serviceCode).toLowerCase() === b.serviceCode.toLowerCase()));
      if (clash) throw refuse(409, 'DUPLICATE_AVAILABILITY', 'This choir already has unavailability overlapping those dates.');
      const row = {
        id: randomUUID(), systemId: MUSIC_SYSTEM, choirId: b.choirId, serviceDate: b.fromDate, endDate: b.toDate,
        serviceCode: b.serviceCode?.toLowerCase() ?? null, reason: b.reason?.trim() || null, active: true,
        recordedByPersonId: ctx.me, recordedAt: new Date(), updatedAt: new Date(),
      };
      insert(ctx, 'unavailability', 'musicChoirUnavailability', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row });
      ctx.audits.push({ action: 'MUSIC_UNAVAILABILITY_RECORDED', detail: `Recorded choir unavailability for ${b.fromDate}`, meta: { availabilityId: row.id, choirId: b.choirId, serviceDate: b.fromDate, serviceCode: row.serviceCode } });
      return;
    }
    case 'availability.clear': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir availability records');
      const row = byId(s.unavailability, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Availability record not found.');
      modify(ctx, 'musicChoirUnavailability', row, { active: false });
      ctx.results.push({ op: change.op, status: 'UPDATED', row });
      ctx.audits.push({ action: 'MUSIC_UNAVAILABILITY_CLEARED', detail: `Cleared choir unavailability for ${row.serviceDate}`, meta: { availabilityId: row.id, choirId: row.choirId, serviceDate: row.serviceDate, serviceCode: row.serviceCode } });
      return;
    }
    /* Protocol */
    case 'rule.create': {
      needSystem(ctx, PROTOCOL_SYSTEM, 'Protocol rules');
      const d = change.data;
      if (!s.services.some((r) => r.id === d.serviceId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active shared calendar service');
      const same = s.rules.find((r) => r.serviceId === d.serviceId);
      if (same) return exists(ctx, change.op, same, toRuleView, 'PROTOCOL_RULE_EXISTS', `Rule for ${d.serviceId} already exists`, { ruleId: same.id });
      const row = {
        ...stamp(ctx), systemId: PROTOCOL_SYSTEM, active: true, required: false, defaultTeamSize: 10,
        teamSizeOverridesJson: '{}', requireChoir: true, requireWorship: true, relaxableKindsJson: '[]', ...ruleFields(d),
      };
      insert(ctx, 'rules', 'protocolServiceRule', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row: toRuleView(row) });
      ctx.audits.push({ action: 'PROTOCOL_RULE_CREATED', detail: `Created protocol rule for ${d.serviceId}`, meta: { ruleId: row.id } });
      return;
    }
    case 'rule.update': {
      needSystem(ctx, PROTOCOL_SYSTEM, 'Protocol rules');
      const row = byId(s.rules, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Protocol rule not found');
      const serviceId = change.patch.serviceId ?? row.serviceId;
      if (!s.services.some((r) => r.id === serviceId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active shared calendar service');
      if (s.rules.some((r) => r.id !== row.id && r.serviceId === serviceId)) throw refuse(409, 'DUPLICATE', 'That service already has a Protocol rule');
      modify(ctx, 'protocolServiceRule', row, ruleFields(change.patch));
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toRuleView(row) });
      ctx.audits.push({ action: 'PROTOCOL_RULE_UPDATED', detail: `Updated Protocol rule for ${serviceId}`, meta: { ruleId: row.id } });
      return;
    }
    case 'duty.create': {
      needSystem(ctx, PROTOCOL_SYSTEM, 'Protocol duty policy');
      const same = s.duty[0];
      if (same) return exists(ctx, change.op, same, toDutyPolicyView, 'DUTY_POLICY_EXISTS', 'Duty policy already exists', { policyId: same.id });
      const row = {
        ...stamp(ctx), systemId: PROTOCOL_SYSTEM, preferTarget: 3, softMax: 3, hardMax: 4, extraDutyPolicy: 'ALLOW_WHEN_SHORT',
        duplicateSameDayAllowed: false, musicCompatibilityRequired: true, leadershipPrioritiesJson: '[]', exceptionsAllowed: true,
        ...dutyFields(change.data),
      };
      insert(ctx, 'duty', 'protocolDutyPolicy', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row: toDutyPolicyView(row) });
      ctx.audits.push({ action: 'DUTY_POLICY_CREATED', detail: 'Created protocol duty policy', meta: { policyId: row.id } });
      return;
    }
    case 'duty.update': {
      needSystem(ctx, PROTOCOL_SYSTEM, 'Protocol duty policy');
      const row = byId(s.duty, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Protocol duty policy not found');
      modify(ctx, 'protocolDutyPolicy', row, dutyFields(change.patch));
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toDutyPolicyView(row) });
      ctx.audits.push({ action: 'DUTY_POLICY_UPDATED', detail: 'Updated Protocol duty policy', meta: { policyId: row.id } });
      return;
    }
  }
}

/** Ops after which every active category x Music-required service pair must still have a rule. */
const IMPLIES_RULES = new Set<ConfigOp['op']>(['service.create', 'service.update', 'category.create', 'category.update']);

/** Ops that never touch the rules the validator reads. They skip step 4 (but not steps 1, 2 or 5). */
const NON_RULE_OPS = new Set<ConfigOp['op']>(['availability.add', 'availability.clear']);

/** Validate the live config as it stands (read-only; used by the page's status banner). */
export async function validateLiveConfig(systemId: string): Promise<GenerationValidation> {
  return validateState(await loadState(systemId));
}

/* ─── The write path ─── */

export interface SaveOutcome { results: ChangeResult[]; lockExpiresAt: string }

export async function saveConfigChange(systemId: string, personId: string, change: ConfigChange): Promise<SaveOutcome> {
  // 1. Tenant + SCHEDULING W. Never trust a client-supplied systemId on its own.
  if (systemId !== MUSIC_SYSTEM && systemId !== PROTOCOL_SYSTEM) throw refuse(400, 'BAD_INPUT', 'Unsupported configuration system');
  const access = (await loadAccessData(personId)).data;
  if (!canWriteConfig(personId, systemId, access)) throw refuse(403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (!change.ops.length) throw refuse(400, 'BAD_INPUT', 'Nothing to save');

  // 2. Edit lock: the caller must hold a live one.
  const lock = await checkEditLock(systemId, personId);
  if (!lock.held) {
    const holder: LockHolder | null = lock.holder;
    throw new ConfigError(409, {
      error: 'LOCKED', code: 'LOCKED', holder,
      message: holder ? `${holder.name ?? 'Another person'} is currently editing configuration.` : 'Open the configuration page to take the edit lock before saving.',
    });
  }

  // 3. Apply to an in-memory copy of the live config.
  const live = await loadState(systemId);
  const working = cloneState(live);
  const ctx: Ctx = { state: working, me: personId, writes: [], audits: [], results: [] };
  for (const op of change.ops) applyOp(ctx, op);
  if (change.ops.some((op) => IMPLIES_RULES.has(op.op))) fillImpliedPolicies(ctx);

  // 4. Validation gates the save (see header for the "no new errors" rule).
  if (!change.ops.every((op) => NON_RULE_OPS.has(op.op)) && ctx.writes.length) {
    const before = new Set(validateState(live).errors);
    const after = validateState(working);
    const introduced = after.errors.filter((e) => !before.has(e));
    if (introduced.length) throw new ConfigError(422, { errors: introduced });
  }

  // 5. Write everything, audit it, and push the lock expiry out, atomically.
  const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
  try {
    await prisma.$transaction(async (tx) => {
      for (const w of ctx.writes) {
        const model = (tx as any)[w.model];
        if (w.kind === 'create') await model.create({ data: w.data });
        else if (w.kind === 'update') await model.update({ where: { id: w.id }, data: w.data });
        else await model.delete({ where: { id: w.id } });
      }
      for (const a of ctx.audits) {
        await tx.auditEvent.create({ data: { at: new Date(), actorId: personId, systemId, action: a.action, resource: 'SCHEDULING', detail: a.detail, metaJson: JSON.stringify(a.meta) } });
      }
      await tx.configEditLock.updateMany({ where: { systemId, holderPersonId: personId }, data: { refreshedAt: new Date(), expiresAt } });
    });
  } catch (error) {
    // Two saves raced past the lock (expiry) or the partial unique indexes caught a duplicate.
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002') {
      throw refuse(409, 'DUPLICATE', 'That already exists. Reload the configuration and try again.');
    }
    throw error;
  }
  return { results: ctx.results, lockExpiresAt: expiresAt.toISOString() };
}
```

## 4. Edit lock and lock routes

### `server/src/scheduling/editLock.ts`
_Atomic acquire, refresh, release, check. Header carries the serialization rationale._

```ts
/**
 * Server-side edit lock for scheduling configuration.
 *
 * WHY THIS EXISTS: configuration edits affect ALL future schedule generation, and there is no draft to
 * isolate them any more. Two people saving at once would silently overwrite each other's intent and could
 * leave the live rules in a state neither of them validated. So edits are SERIALIZED: one holder per system
 * at a time. The lock is advisory for readers (anyone with read access can still look) and mandatory for
 * writers (`saveConfigChange` refuses a write unless the caller holds a live lock).
 *
 * Lifecycle: acquired on entering the config page, released on save-and-leave or leaving, expires after
 * LOCK_TTL_MS without activity (refreshed by every successful save and by the page's heartbeat).
 * One row per system (`ConfigEditLock`, systemId is the primary key). No foreign key to Person, so a deleted
 * person can never wedge a system.
 *
 * Single-tab assumption: the holder is a person, not a browser tab. The same person in two tabs shares one
 * lock, and the first tab to close releases it for both. The 15-minute expiry is the backstop.
 */

import { prisma } from '../lib/prisma.js';

export const LOCK_TTL_MS = 15 * 60 * 1000;

export interface LockHolder { personId: string; name: string | null; since: string; expiresAt: string }

export type AcquireResult =
  | { ok: true; lock: { systemId: string; expiresAt: string } }
  | { ok: false; holder: LockHolder };

async function holderOf(row: { holderPersonId: string; acquiredAt: Date; expiresAt: Date }): Promise<LockHolder> {
  const person = await prisma.person.findUnique({ where: { id: row.holderPersonId }, select: { fullName: true } }).catch(() => null);
  return {
    personId: row.holderPersonId,
    name: (person as { fullName?: string } | null)?.fullName ?? null,
    since: row.acquiredAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** Take the lock. Succeeds when nobody holds it, the caller already holds it, or the holder's lock expired. */
export async function acquireEditLock(systemId: string, personId: string, now = new Date()): Promise<AcquireResult> {
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
  // Atomic takeover: only matches a row the caller owns or one that has already expired.
  const taken = await prisma.configEditLock.updateMany({
    where: { systemId, OR: [{ holderPersonId: personId }, { expiresAt: { lte: now } }] },
    data: { holderPersonId: personId, acquiredAt: now, refreshedAt: now, expiresAt },
  });
  if (taken.count === 1) return { ok: true, lock: { systemId, expiresAt: expiresAt.toISOString() } };

  const current = await prisma.configEditLock.findUnique({ where: { systemId } });
  if (!current) {
    try {
      await prisma.configEditLock.create({ data: { systemId, holderPersonId: personId, acquiredAt: now, refreshedAt: now, expiresAt } });
      return { ok: true, lock: { systemId, expiresAt: expiresAt.toISOString() } };
    } catch (error) {
      // Lost a race on the primary key: someone else created the row between our read and write.
      if (!(error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002')) throw error;
      const winner = await prisma.configEditLock.findUnique({ where: { systemId } });
      if (!winner) throw error;
      return winner.holderPersonId === personId ? { ok: true, lock: { systemId, expiresAt: winner.expiresAt.toISOString() } } : { ok: false, holder: await holderOf(winner) };
    }
  }
  return { ok: false, holder: await holderOf(current) };
}

/** Push the expiry out. Fails (false) when the caller no longer holds a live lock. */
export async function refreshEditLock(systemId: string, personId: string, now = new Date()): Promise<boolean> {
  const done = await prisma.configEditLock.updateMany({
    where: { systemId, holderPersonId: personId, expiresAt: { gt: now } },
    data: { refreshedAt: now, expiresAt: new Date(now.getTime() + LOCK_TTL_MS) },
  });
  return done.count === 1;
}

/** Release the lock. Only the holder can; anyone else's call is a no-op that reports false. */
export async function releaseEditLock(systemId: string, personId: string): Promise<boolean> {
  const done = await prisma.configEditLock.deleteMany({ where: { systemId, holderPersonId: personId } });
  return done.count === 1;
}

/**
 * Does `personId` hold a live lock? When not, `holder` is whoever blocks them (null when nobody holds one,
 * or the previous holder's lock has expired).
 */
export async function checkEditLock(systemId: string, personId: string, now = new Date()): Promise<{ held: boolean; holder: LockHolder | null }> {
  const row = await prisma.configEditLock.findUnique({ where: { systemId } });
  if (!row || row.expiresAt <= now) return { held: false, holder: null };
  if (row.holderPersonId === personId) return { held: true, holder: null };
  return { held: false, holder: await holderOf(row) };
}
```

### `server/src/scheduling/configRouter.ts (lock routes, lines 162-205)`
_The three lock routes. The full router is in section 6._

```ts
/* ─── Edit lock ─── */

async function lockGate(req: AuthedRequest, res: Res): Promise<string | null> {
  const raw = systemIdOf(req) ?? (typeof (req.body as { systemId?: unknown } | undefined)?.systemId === 'string' ? (req.body as { systemId: string }).systemId : undefined);
  if (!raw || !isConfigSystem(raw)) { fail(res, 400, 'BAD_INPUT', 'A supported systemId is required'); return null; }
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadConfig(me, raw, data)) { fail(res, 404, 'NOT_FOUND', 'Not found'); return null; }
  if (!canWriteConfig(me, raw, data)) { fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration'); return null; }
  return raw;
}

configRouter.post('/config/lock', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await lockGate(req, res);
  if (!systemId) return;
  const result = await acquireEditLock(systemId, req.auth!.personId);
  if (!result.ok) {
    return res.status(409).json({
      error: 'LOCKED', code: 'LOCKED', holder: result.holder,
      message: `${result.holder.name ?? 'Another person'} is currently editing configuration.`,
    });
  }
  res.json({ ok: true, lock: result.lock });
});

configRouter.post('/config/lock/refresh', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await lockGate(req, res);
  if (!systemId) return;
  if (!(await refreshEditLock(systemId, req.auth!.personId))) {
    return res.status(409).json({ error: 'LOCKED', code: 'LOCKED', holder: null, message: 'Your edit lock expired. Reopen the configuration to take it again.' });
  }
  res.json({ ok: true });
});

configRouter.delete('/config/lock', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await lockGate(req, res);
  if (!systemId) return;
  res.json({ ok: true, released: await releaseEditLock(systemId, req.auth!.personId) });
});

/* ─── Validation status ─── */

configRouter.get('/config/validation', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await readGate(req, res);
```

## 5. `configLoader.ts` (rewritten)

### `server/src/scheduling/configLoader.ts`
_No version argument; reads the live active rows._

```ts
/**
 * Load the LIVE scheduling configuration for a system from the database.
 * The engines call this to get their rules instead of hard-coding them.
 *
 * There are no versions: whatever is saved is what the next generate call sees. Confirmed and published
 * schedules never call this to rebuild themselves; they are frozen copies (see the frozen-schedule guard in
 * routes/musicSchedule.ts and routes/protocol.ts).
 * Availability (unavailability) was always live and is read the same way as before.
 */
import { prisma } from '../lib/prisma.js';
import {
  toServiceView,
  toCategoryView,
  toPolicyView,
  toLinkView,
  toRuleView,
  toDutyPolicyView,
} from './store.js';
import type {
  CategoryServicePolicyView,
  ChoirCategoryLinkView,
  ChoirCategoryView,
  MusicChoirUnavailabilityView,
  MusicFixedAssignmentView,
  ProtocolDutyPolicyView,
  ProtocolServiceRuleView,
  SchedulingServiceView,
} from './types.js';

export const SYSTEM_MUSIC = 'sys-music';
export const SYSTEM_PROTOCOL = 'sys-protocol';

export type LoadedMusicConfig = {
  services: SchedulingServiceView[];
  categories: ChoirCategoryView[];
  policies: CategoryServicePolicyView[];
  /** choirId -> categoryIds the choir belongs to */
  choirLinks: Map<string, string[]>;
  /** choirId -> service-code eligibility exceptions */
  choirEligibilityOverrides: Map<string, Record<string, unknown>>;
  links: ChoirCategoryLinkView[];
  fixedAssignments: MusicFixedAssignmentView[];
  unavailability: MusicChoirUnavailabilityView[];
};

export type LoadedProtocolConfig = {
  services: SchedulingServiceView[];
  rules: ProtocolServiceRuleView[];
  dutyPolicy: ProtocolDutyPolicyView | null;
};

/** Load everything the Music engine needs. */
export async function loadMusicConfig(): Promise<LoadedMusicConfig> {
  const live = { systemId: SYSTEM_MUSIC, active: true };
  const [services, categories, policies, links, fixedAssignments, unavailability] = await Promise.all([
    prisma.schedulingService.findMany({ where: live }),
    prisma.choirCategory.findMany({ where: live }),
    prisma.categoryServicePolicy.findMany({ where: live }),
    prisma.choirCategoryLink.findMany({ where: live }),
    prisma.musicFixedAssignment.findMany({ where: { systemId: SYSTEM_MUSIC } }),
    prisma.musicChoirUnavailability.findMany({ where: { systemId: SYSTEM_MUSIC, active: true } }),
  ]);
  const choirLinks = new Map<string, string[]>();
  const choirEligibilityOverrides = new Map<string, Record<string, unknown>>();
  for (const l of links) {
    const arr = choirLinks.get(l.choirId) ?? [];
    arr.push(l.categoryId);
    choirLinks.set(l.choirId, arr);
    choirEligibilityOverrides.set(l.choirId, toLinkView(l).eligibleOverride);
  }
  return {
    services: services.map(toServiceView),
    categories: categories.map(toCategoryView),
    policies: policies.map(toPolicyView),
    choirLinks,
    choirEligibilityOverrides,
    links: links.map(toLinkView),
    fixedAssignments: fixedAssignments.map((row) => ({
      id: row.id,
      systemId: row.systemId,
      categoryServicePolicyId: row.categoryServicePolicyId,
      choirId: row.choirId,
      serviceDate: row.serviceDate,
      serviceTime: row.serviceTime,
      displayOrder: row.displayOrder,
      createdByPersonId: row.createdByPersonId,
      createdAt: row.createdAt.toISOString(),
    })),
    unavailability: unavailability.map((row) => ({
      id: row.id,
      systemId: row.systemId,
      choirId: row.choirId,
      serviceDate: row.serviceDate,
      serviceCode: row.serviceCode,
      endDate: row.endDate,
      reason: row.reason,
      active: row.active,
      recordedByPersonId: row.recordedByPersonId,
      recordedAt: row.recordedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

/** Load everything the Protocol engine needs. The calendar is the live Music calendar. */
export async function loadProtocolConfig(): Promise<LoadedProtocolConfig> {
  const [services, rules, dutyPolicy] = await Promise.all([
    prisma.schedulingService.findMany({ where: { systemId: SYSTEM_MUSIC, active: true } }),
    prisma.protocolServiceRule.findMany({ where: { systemId: SYSTEM_PROTOCOL, active: true } }),
    prisma.protocolDutyPolicy.findFirst({ where: { systemId: SYSTEM_PROTOCOL } }),
  ]);
  return {
    services: services.map(toServiceView),
    rules: rules.map(toRuleView),
    dutyPolicy: dutyPolicy ? toDutyPolicyView(dutyPolicy) : null,
  };
}

// ...unchanged: nothing else lived in this file.
```

## 6. Routes and engines

### `server/src/scheduling/configRouter.ts`
_Rewritten. Every mutating route calls saveConfigChange; /versions routes are gone; old clients' configVersionId is ignored._

```ts
/**
 * Scheduling configuration HTTP API: LIVE settings (no versions, no drafts, no activation).
 *
 *   GET    /api/scheduling/config/services|categories|policies|links       read live rows
 *   GET    /api/scheduling/config/fixed-assignments|availability           read live rows
 *   GET    /api/scheduling/config/protocol/rules|policy                    read live rows
 *   GET    /api/scheduling/config/validation                               can the live config generate?
 *   POST   /api/scheduling/config/services|categories|policies|links       create
 *   PATCH  /api/scheduling/config/services|categories|policies|links/:id   edit
 *   POST   /api/scheduling/config/services/:id/retire                      retire a service
 *   POST   /api/scheduling/config/fixed-assignments  DELETE .../:id        designate / remove a choir
 *   POST   /api/scheduling/config/availability       DELETE .../:id        record / clear unavailability
 *   POST   /api/scheduling/config/protocol/rules     PATCH .../:id         Protocol team rules
 *   POST   /api/scheduling/config/protocol/policy    PATCH .../:id         Protocol duty policy
 *   POST   /api/scheduling/config/lock               take the edit lock
 *   POST   /api/scheduling/config/lock/refresh       keep it alive
 *   DELETE /api/scheduling/config/lock               give it up
 *
 * Query `systemId` selects the tenant. Authorization is by SCHEDULING letters held in that system, never by
 * a client-supplied systemId alone.
 *
 * EVERY mutating route below does one thing: build a change and hand it to `saveConfigChange`, which owns the
 * permission check, the edit lock, validation and the audit entry. A route that writes a row itself is a bug.
 *
 * Compatibility: old clients still send `configVersionId` in bodies and queries. It is ignored (zod strips
 * unknown keys; query params are never read). The /versions routes are gone and now answer 404.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest, pathParam } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { canReadConfig, canWriteConfig } from './rules.js';
import {
  EligibleOverrideSchema, FrequencyOverrideSchema, FrequencyPeriodSchema,
} from './musicConfigRules.js';
import { toCategoryView, toDutyPolicyView, toLinkView, toPolicyView, toRuleView, toServiceView } from './store.js';
import { acquireEditLock, refreshEditLock, releaseEditLock } from './editLock.js';
import {
  ConfigError, MUSIC_SYSTEM, PROTOCOL_SYSTEM, saveConfigChange, validateLiveConfig,
  type ConfigOp,
} from './saveConfigChange.js';

export const configRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const accessOf = async (me: string) => (await loadAccessData(me)).data;

const IdSchema = z.string().min(1);
const NonEmptyName = z.string().trim().min(1).max(120);
const CodeSchema = z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/);
const PositiveInt = z.number().int().positive();
const NonNegativeInt = z.number().int().nonnegative();
const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date.');

const ServiceSchema = z.object({
  systemId: z.literal(MUSIC_SYSTEM),
  code: CodeSchema,
  name: NonEmptyName,
  kind: z.enum(['SERVICE', 'REHEARSAL', 'MEETING', 'OTHER']).default('SERVICE'),
  weekday: z.number().int().min(0).max(6).optional().nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  recurrence: z.enum(['WEEKLY', 'MONTHLY', 'SELECTED_DATES', 'CUSTOM']).default('WEEKLY'),
  selectedDates: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  musicRequired: z.boolean().default(false),
  protocolRequired: z.boolean().default(false),
  maxChoirs: NonNegativeInt.default(3),
  displayOrder: NonNegativeInt.default(0),
});
const CategorySchema = z.object({
  systemId: z.literal(MUSIC_SYSTEM),
  code: CodeSchema,
  name: NonEmptyName,
  description: z.string().max(500).default(''),
  active: z.boolean().default(true),
});
const PolicySchema = z.object({
  systemId: z.literal(MUSIC_SYSTEM),
  categoryId: IdSchema,
  serviceId: IdSchema,
  eligible: z.boolean().default(true),
  active: z.boolean().default(true),
  frequencyTarget: PositiveInt.optional().nullable(),
  frequencyCounting: z.enum(['ASSIGNMENTS', 'DISTINCT_DATES']).default('ASSIGNMENTS'),
  frequencyKind: z.enum(['MINIMUM', 'TARGET', 'MAXIMUM']).default('TARGET'),
  planningMode: z.enum(['ROTATION', 'FIXED', 'MANUAL']).default('ROTATION'),
  minCount: NonNegativeInt.optional().nullable(),
  maxCount: NonNegativeInt.optional().nullable(),
  frequencyPeriod: FrequencyPeriodSchema.optional().nullable(),
  requireAll: z.boolean().default(false),
});
const LinkSchema = z.object({
  systemId: z.literal(MUSIC_SYSTEM),
  choirId: IdSchema,
  categoryId: IdSchema,
  eligibleOverride: EligibleOverrideSchema,
  frequencyOverride: FrequencyOverrideSchema,
  active: z.boolean().default(true),
});
const ProtocolRuleSchema = z.object({
  systemId: z.literal(PROTOCOL_SYSTEM),
  serviceId: IdSchema,
  active: z.boolean().default(true),
  required: z.boolean().default(false),
  defaultTeamSize: PositiveInt.default(10),
  teamSizeOverrides: z.record(z.string(), PositiveInt).default({}),
  requireChoir: z.boolean().default(true),
  requireWorship: z.boolean().default(true),
  relaxableKinds: z.array(z.string()).default([]),
});
const DutyPolicySchema = z.object({
  systemId: z.literal(PROTOCOL_SYSTEM),
  preferTarget: PositiveInt.default(3),
  softMax: PositiveInt.default(3),
  hardMax: PositiveInt.default(4),
  extraDutyPolicy: z.enum(['ALLOW_WHEN_SHORT', 'NEVER', 'ALWAYS']).default('ALLOW_WHEN_SHORT'),
  duplicateSameDayAllowed: z.boolean().default(false),
  musicCompatibilityRequired: z.boolean().default(true),
  leadershipPriorities: z.array(z.string()).default([]),
  exceptionsAllowed: z.boolean().default(true),
});

/* ─── Helpers ─── */

function systemIdOf(req: AuthedRequest): string | undefined {
  const raw = req.query.systemId;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return undefined;
}
const isConfigSystem = (systemId: string) => systemId === MUSIC_SYSTEM || systemId === PROTOCOL_SYSTEM;

/** Read gate: SCHEDULING R in the tenant, else 404 (never reveal the system exists). */
async function readGate(req: AuthedRequest, res: Res, only?: string): Promise<string | null> {
  const systemId = systemIdOf(req);
  if (!systemId || !isConfigSystem(systemId) || (only && systemId !== only)) { fail(res, 400, 'BAD_INPUT', 'A supported systemId is required'); return null; }
  if (!canReadConfig(req.auth!.personId, systemId, await accessOf(req.auth!.personId))) { fail(res, 404, 'NOT_FOUND', 'Not found'); return null; }
  return systemId;
}

/** Run one change through the single write path and translate its refusals. */
async function save(req: AuthedRequest, res: Res, systemId: string, op: ConfigOp, reply: (row: unknown, status: string) => object, createdStatus = 201) {
  try {
    const { results } = await saveConfigChange(systemId, req.auth!.personId, { ops: [op] });
    const main = results.find((r) => r.op === op.op)!;
    const code = main.status === 'CREATED' ? createdStatus : 200;
    return res.status(code).json({ ...reply(main.row, main.status), status: main.status, implied: results.filter((r) => r.op === 'policy.implied').length });
  } catch (error) {
    if (error instanceof ConfigError) return res.status(error.status).json(error.body);
    throw error;
  }
}
const badInput = (res: Res, what: string) => fail(res, 400, 'BAD_INPUT', what);
const idOf = (req: AuthedRequest) => { const id = pathParam(req, 'id'); return id && IdSchema.safeParse(id).success ? id : null; };

/* ─── Edit lock ─── */

async function lockGate(req: AuthedRequest, res: Res): Promise<string | null> {
  const raw = systemIdOf(req) ?? (typeof (req.body as { systemId?: unknown } | undefined)?.systemId === 'string' ? (req.body as { systemId: string }).systemId : undefined);
  if (!raw || !isConfigSystem(raw)) { fail(res, 400, 'BAD_INPUT', 'A supported systemId is required'); return null; }
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadConfig(me, raw, data)) { fail(res, 404, 'NOT_FOUND', 'Not found'); return null; }
  if (!canWriteConfig(me, raw, data)) { fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration'); return null; }
  return raw;
}

configRouter.post('/config/lock', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await lockGate(req, res);
  if (!systemId) return;
  const result = await acquireEditLock(systemId, req.auth!.personId);
  if (!result.ok) {
    return res.status(409).json({
      error: 'LOCKED', code: 'LOCKED', holder: result.holder,
      message: `${result.holder.name ?? 'Another person'} is currently editing configuration.`,
    });
  }
  res.json({ ok: true, lock: result.lock });
});

configRouter.post('/config/lock/refresh', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await lockGate(req, res);
  if (!systemId) return;
  if (!(await refreshEditLock(systemId, req.auth!.personId))) {
    return res.status(409).json({ error: 'LOCKED', code: 'LOCKED', holder: null, message: 'Your edit lock expired. Reopen the configuration to take it again.' });
  }
  res.json({ ok: true });
});

configRouter.delete('/config/lock', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await lockGate(req, res);
  if (!systemId) return;
  res.json({ ok: true, released: await releaseEditLock(systemId, req.auth!.personId) });
});

/* ─── Validation status ─── */

configRouter.get('/config/validation', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await readGate(req, res);
  if (!systemId) return;
  res.json(await validateLiveConfig(systemId));
});

/* ─── Services ─── */

configRouter.get('/config/services', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res))) return;
  const rows = await prisma.schedulingService.findMany({
    where: { systemId: MUSIC_SYSTEM, ...(req.query.active === 'true' ? { active: true } : {}) },
    orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
  });
  res.json({ services: rows.map(toServiceView) });
});

configRouter.post('/config/services', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = ServiceSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Invalid service');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'service.create', data }, (service) => ({ service }));
});

configRouter.patch('/config/services/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  const parsed = z.object({
    patch: ServiceSchema.omit({ systemId: true }).partial(),
  }).safeParse(req.body);
  if (!id || !parsed.success) return badInput(res, 'Check the service fields');
  return save(req, res, MUSIC_SYSTEM, { op: 'service.update', id, patch: parsed.data.patch }, (service) => ({ service }));
});

configRouter.post('/config/services/:id/retire', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  if (!id) return badInput(res, 'Invalid service id');
  return save(req, res, MUSIC_SYSTEM, { op: 'service.retire', id }, () => ({ ok: true }));
});

/* ─── Categories ─── */

configRouter.get('/config/categories', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res, MUSIC_SYSTEM))) return;
  const rows = await prisma.choirCategory.findMany({
    where: { systemId: MUSIC_SYSTEM, ...(req.query.active === 'true' ? { active: true } : {}) },
    orderBy: [{ code: 'asc' }],
  });
  res.json({ categories: rows.map(toCategoryView) });
});

configRouter.post('/config/categories', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = CategorySchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Invalid category');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'category.create', data }, (category) => ({ category }));
});

configRouter.patch('/config/categories/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  const parsed = z.object({ patch: CategorySchema.pick({ code: true, name: true, description: true, active: true }).partial() }).safeParse(req.body);
  if (!id || !parsed.success) return badInput(res, 'Check the category fields');
  return save(req, res, MUSIC_SYSTEM, { op: 'category.update', id, patch: parsed.data.patch }, (category) => ({ category }));
});

/* ─── Category x service policies ─── */

configRouter.get('/config/policies', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res, MUSIC_SYSTEM))) return;
  const rows = await prisma.categoryServicePolicy.findMany({ where: { systemId: MUSIC_SYSTEM } });
  res.json({ policies: rows.map(toPolicyView) });
});

configRouter.post('/config/policies', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = PolicySchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Invalid policy');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'policy.create', data }, (policy) => ({ policy }));
});

configRouter.patch('/config/policies/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  const parsed = z.object({
    patch: PolicySchema.pick({
      categoryId: true, serviceId: true, eligible: true, active: true, frequencyTarget: true, frequencyCounting: true,
      frequencyKind: true, frequencyPeriod: true, planningMode: true, minCount: true, maxCount: true, requireAll: true,
    }).partial(),
  }).safeParse(req.body);
  if (!id || !parsed.success) return badInput(res, 'Check the category policy fields');
  return save(req, res, MUSIC_SYSTEM, { op: 'policy.update', id, patch: parsed.data.patch }, (policy) => ({ policy }));
});

/* ─── Choir <-> category links ─── */

configRouter.get('/config/links', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res, MUSIC_SYSTEM))) return;
  const rows = await prisma.choirCategoryLink.findMany({ where: { systemId: MUSIC_SYSTEM } });
  res.json({ links: rows.map(toLinkView) });
});

configRouter.post('/config/links', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = LinkSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Invalid link');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'link.create', data }, (link) => ({ link }));
});

configRouter.patch('/config/links/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  const parsed = z.object({
    patch: LinkSchema.pick({ choirId: true, categoryId: true, eligibleOverride: true, frequencyOverride: true, active: true }).partial(),
  }).safeParse(req.body);
  if (!id || !parsed.success) return badInput(res, 'Check the choir category link fields');
  return save(req, res, MUSIC_SYSTEM, { op: 'link.update', id, patch: parsed.data.patch }, (link) => ({ link }));
});

/* ─── Fixed Music designations ─── */

configRouter.get('/config/fixed-assignments', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res, MUSIC_SYSTEM))) return;
  const assignments = await prisma.musicFixedAssignment.findMany({
    where: { systemId: MUSIC_SYSTEM }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ assignments });
});

configRouter.post('/config/fixed-assignments', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({
    systemId: z.literal(MUSIC_SYSTEM),
    categoryServicePolicyId: IdSchema.optional(),
    serviceId: IdSchema.optional(),
    serviceDate: z.string().date().optional().nullable(),
    serviceTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
    choirId: IdSchema,
    displayOrder: NonNegativeInt.default(0),
  }).safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Choose a fixed rule and a choir.');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'fixed.create', data }, (assignment) => ({ assignment }));
});

configRouter.delete('/config/fixed-assignments/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  if (!id) return badInput(res, 'Choose the fixed assignment to remove.');
  return save(req, res, MUSIC_SYSTEM, { op: 'fixed.delete', id }, () => ({ ok: true }));
});

/* ─── Music choir availability ─── */

configRouter.get('/config/availability', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await readGate(req, res, MUSIC_SYSTEM);
  if (!systemId) return;
  const filter = z.object({ serviceDate: DateOnly.optional(), choirId: IdSchema.optional() }).safeParse(req.query);
  if (!filter.success) return badInput(res, 'Check the date or choir filter.');
  const records = await prisma.musicChoirUnavailability.findMany({
    where: { systemId, active: true, ...(filter.data.choirId ? { choirId: filter.data.choirId } : {}) },
    orderBy: [{ serviceDate: 'asc' }, { serviceCode: 'asc' }],
  });
  res.json({ availability: records.filter((row) => !filter.data.serviceDate || (row.serviceDate <= filter.data.serviceDate && (row.endDate ?? row.serviceDate) >= filter.data.serviceDate)).slice(0, 200) });
});

configRouter.post('/config/availability', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({
    systemId: z.literal(MUSIC_SYSTEM),
    choirId: IdSchema,
    serviceDate: DateOnly.optional(),
    fromDate: DateOnly.optional(),
    toDate: DateOnly.optional(),
    serviceCode: CodeSchema.optional().nullable(),
    reason: z.string().trim().max(500).optional().nullable(),
  }).safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Choose a choir, date, and optional service.');
  const b = parsed.data;
  const start = b.fromDate ?? b.serviceDate;
  const end = b.toDate ?? start;
  if (!start || !end) return badInput(res, 'Choose a valid From and To date; To cannot be before From.');
  return save(req, res, b.systemId, { op: 'availability.add', data: { choirId: b.choirId, fromDate: start, toDate: end, serviceCode: b.serviceCode, reason: b.reason } }, (availability) => ({ availability }));
});

configRouter.delete('/config/availability/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  if (!id) return badInput(res, 'Invalid availability record.');
  return save(req, res, MUSIC_SYSTEM, { op: 'availability.clear', id }, () => ({ ok: true }));
});

/* ─── Protocol service rules ─── */

configRouter.get('/config/protocol/rules', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res, PROTOCOL_SYSTEM))) return;
  const [rules, services] = await Promise.all([
    prisma.protocolServiceRule.findMany({ where: { systemId: PROTOCOL_SYSTEM } }),
    prisma.schedulingService.findMany({ where: { systemId: MUSIC_SYSTEM } }),
  ]);
  const codeById = new Map(services.map((service) => [service.id, service.code]));
  res.json({ rules: rules.map((rule) => ({ ...toRuleView(rule), serviceCode: codeById.get(rule.serviceId) })) });
});

configRouter.post('/config/protocol/rules', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = ProtocolRuleSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Invalid protocol rule');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'rule.create', data }, (rule) => ({ rule }));
});

configRouter.patch('/config/protocol/rules/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  const parsed = z.object({
    patch: ProtocolRuleSchema.pick({
      serviceId: true, active: true, required: true, defaultTeamSize: true, teamSizeOverrides: true,
      requireChoir: true, requireWorship: true, relaxableKinds: true,
    }).partial(),
  }).safeParse(req.body);
  if (!id || !parsed.success) return badInput(res, 'Check the Protocol service rule fields');
  return save(req, res, PROTOCOL_SYSTEM, { op: 'rule.update', id, patch: parsed.data.patch }, (rule) => ({ rule }));
});

/* ─── Protocol duty policy ─── */

configRouter.get('/config/protocol/policy', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res, PROTOCOL_SYSTEM))) return;
  const row = await prisma.protocolDutyPolicy.findFirst({ where: { systemId: PROTOCOL_SYSTEM } });
  res.json({ policy: row ? toDutyPolicyView(row) : null });
});

configRouter.post('/config/protocol/policy', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = DutyPolicySchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Invalid duty policy');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'duty.create', data }, (policy) => ({ policy }));
});

configRouter.patch('/config/protocol/policy/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  const parsed = z.object({
    patch: DutyPolicySchema.omit({ systemId: true }).partial(),
  }).safeParse(req.body);
  if (!id || !parsed.success) return badInput(res, 'Check the Protocol duty policy fields');
  return save(req, res, PROTOCOL_SYSTEM, { op: 'duty.update', id, patch: parsed.data.patch }, (policy) => ({ policy }));
});
```

### `server/src/scheduling/store.ts`
_Mappers only. All version CRUD removed._

```ts
/**
 * Row mappers for the live scheduling configuration.
 *
 * Writing is NOT done here any more: every config mutation goes through
 * `saveConfigChange` (saveConfigChange.ts) so validation, the edit lock and the
 * audit entry can never be skipped. Reading goes through `configLoader.ts`.
 * The old version CRUD (create/clone/activate/archive/supersede) is gone with ConfigVersion.
 */

import type {
  SchedulingServiceView, ChoirCategoryView, CategoryServicePolicyView, ChoirCategoryLinkView,
  ProtocolServiceRuleView, ProtocolDutyPolicyView,
  ServiceKind, FrequencyCounting, FrequencyKind, FrequencyPeriod, PlanningMode, Recurrence,
} from './types.js';
import { parseJson } from './types.js';

export function toServiceView(r: any): SchedulingServiceView {
  return {
    id: r.id, systemId: r.systemId, code: r.code, name: r.name, kind: r.kind as ServiceKind,
    weekday: r.weekday, time: r.time, recurrence: r.recurrence as Recurrence,
    selectedDates: parseJson(r.selectedDatesJson, []),
    active: r.active,
    musicRequired: r.musicRequired, protocolRequired: r.protocolRequired,
    maxChoirs: r.maxChoirs, targetTeamSize: r.targetTeamSize ?? 10,
    displayOrder: r.displayOrder,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toCategoryView(r: any): ChoirCategoryView {
  return {
    id: r.id, systemId: r.systemId, code: r.code, name: r.name, description: r.description,
    active: r.active,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toPolicyView(r: any): CategoryServicePolicyView {
  return {
    id: r.id, systemId: r.systemId, categoryId: r.categoryId, serviceId: r.serviceId,
    active: r.active ?? true,
    eligible: r.eligible, frequencyTarget: r.frequencyTarget,
    frequencyCounting: r.frequencyCounting as FrequencyCounting,
    frequencyKind: r.frequencyKind as FrequencyKind,
    frequencyPeriod: r.frequencyPeriod as FrequencyPeriod | null,
    planningMode: r.planningMode as PlanningMode,
    minCount: r.minCount, maxCount: r.maxCount, requireAll: r.requireAll,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toLinkView(r: any): ChoirCategoryLinkView {
  return {
    id: r.id, systemId: r.systemId, choirId: r.choirId, categoryId: r.categoryId,
    eligibleOverride: parseJson(r.eligibleOverrideJson, {}),
    frequencyOverride: parseJson(r.frequencyOverrideJson, {}),
    active: r.active,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toRuleView(r: any): ProtocolServiceRuleView {
  return {
    id: r.id, systemId: r.systemId, serviceId: r.serviceId, active: r.active ?? true,
    required: r.required,
    defaultTeamSize: r.defaultTeamSize,
    teamSizeOverrides: parseJson(r.teamSizeOverridesJson, {}),
    requireChoir: r.requireChoir, requireWorship: r.requireWorship,
    relaxableKinds: parseJson(r.relaxableKindsJson, []),
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toDutyPolicyView(r: any): ProtocolDutyPolicyView {
  return {
    id: r.id, systemId: r.systemId,
    preferTarget: r.preferTarget, softMax: r.softMax, hardMax: r.hardMax,
    extraDutyPolicy: r.extraDutyPolicy as 'ALLOW_WHEN_SHORT' | 'NEVER' | 'ALWAYS',
    duplicateSameDayAllowed: r.duplicateSameDayAllowed,
    musicCompatibilityRequired: r.musicCompatibilityRequired,
    leadershipPriorities: parseJson(r.leadershipPrioritiesJson, []),
    exceptionsAllowed: r.exceptionsAllowed,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}
```

### `server/src/scheduling/types.ts (diff)`
_Version, effective and supersedes fields removed._

```diff
--- a/server/src/scheduling/types.ts
+++ b/server/src/scheduling/types.ts
@@ -1,27 +1,20 @@
 /**
- * Configurable Music & Protocol scheduling (slice 3.17).
+ * Configurable Music & Protocol scheduling.
  *
- * Tenant-scoped, versioned configuration that replaces hard-coded church
- * scheduling policy. Every row carries systemId, effectiveFrom / effectiveTo
- * and status; edits supersede the prior row instead of overwriting it.
- * MusicMonth and ProtocolPlan record the ConfigVersion they were generated
- * against, keeping published schedules reproducible.
- *
- * Phase 2 boundary: this module only persists and reads configuration. It does
- * not modify the Music or Protocol scheduling engines.
+ * Tenant-scoped LIVE configuration. Rows are edited in place; the next
+ * generate call reads them. There are no versions, drafts or effective ranges.
+ * Confirmed/published schedules are frozen copies and are never rebuilt.
  */
 
-import type { ConfigVersion, SchedulingService, ChoirCategory, CategoryServicePolicy, ChoirCategoryLink, ProtocolServiceRule, ProtocolDutyPolicy } from '@prisma/client';
+import type { SchedulingService, ChoirCategory, CategoryServicePolicy, ChoirCategoryLink, ProtocolServiceRule, ProtocolDutyPolicy } from '@prisma/client';
 
-export type { ConfigVersion, SchedulingService, ChoirCategory, CategoryServicePolicy, ChoirCategoryLink, ProtocolServiceRule, ProtocolDutyPolicy };
+export type { SchedulingService, ChoirCategory, CategoryServicePolicy, ChoirCategoryLink, ProtocolServiceRule, ProtocolDutyPolicy };
 
 export const SYSTEM_MUSIC = 'sys-music';
 export const SYSTEM_PROTOCOL = 'sys-protocol';
 
 export type SystemId = string;
 
-export type ConfigStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'SCHEDULED' | 'ARCHIVED';
-
 export type ServiceKind = 'SERVICE' | 'REHEARSAL' | 'MEETING' | 'OTHER';
 
 export type FrequencyCounting = 'ASSIGNMENTS' | 'DISTINCT_DATES';
@@ -49,15 +42,11 @@
   recurrence: Recurrence;
   selectedDates: string[];
   active: boolean;
-  effectiveFrom: string;
-  effectiveTo: string | null;
   musicRequired: boolean;
   protocolRequired: boolean;
   maxChoirs: number;
   targetTeamSize: number;
-  configVersionId: string | null;
   displayOrder: number;
-  supersedesId: string | null;
   createdByPersonId: string;
   createdAt: string;
 }
@@ -69,10 +58,6 @@
   name: string;
   description: string;
   active: boolean;
-  effectiveFrom: string;
-  effectiveTo: string | null;
-  configVersionId: string | null;
-  supersedesId: string | null;
   createdByPersonId: string;
   createdAt: string;
 }
@@ -92,10 +77,6 @@
   minCount: number | null;
   maxCount: number | null;
   requireAll: boolean;
-  configVersionId: string | null;
-  effectiveFrom: string;
-  effectiveTo: string | null;
-  supersedesId: string | null;
   createdByPersonId: string;
   createdAt: string;
 }
@@ -108,10 +89,6 @@
   eligibleOverride: Record<string, unknown>;
   frequencyOverride: Record<string, unknown>;
   active: boolean;
-  effectiveFrom: string;
-  effectiveTo: string | null;
-  configVersionId: string | null;
-  supersedesId: string | null;
   createdByPersonId: string;
   createdAt: string;
 }
@@ -119,7 +96,6 @@
 export interface MusicFixedAssignmentView {
   id: string;
   systemId: string;
-  configVersionId: string;
   categoryServicePolicyId: string;
   choirId: string;
   serviceDate?: string | null;
@@ -154,10 +130,6 @@
   requireChoir: boolean;
   requireWorship: boolean;
   relaxableKinds: string[];
-  configVersionId: string | null;
-  effectiveFrom: string;
-  effectiveTo: string | null;
-  supersedesId: string | null;
   createdByPersonId: string;
   createdAt: string;
 }
@@ -173,46 +145,10 @@
   musicCompatibilityRequired: boolean;
   leadershipPriorities: string[];
   exceptionsAllowed: boolean;
-  configVersionId: string | null;
-  effectiveFrom: string;
-  effectiveTo: string | null;
-  supersedesId: string | null;
   createdByPersonId: string;
   createdAt: string;
 }
 
-export interface ConfigVersionView {
-  id: string;
-  systemId: string;
-  version: number;
-  label: string;
-  status: ConfigStatus;
-  effectiveFrom: string;
-  effectiveTo: string | null;
-  createdByPersonId: string;
-  createdAt: string;
-  reason: string | null;
-  previousVersionId: string | null;
-  notes: Record<string, unknown>;
-  validation: Record<string, unknown>;
-  affectedSchedules: string[];
-}
-
-export interface ConfigVersionCreateInput {
-  systemId: string;
-  version: number;
-  label: string;
-  status?: ConfigStatus;
-  effectiveFrom?: string;
-  effectiveTo?: string | null;
-  createdByPersonId: string;
-  reason?: string | null;
-  previousVersionId?: string | null;
-  notes?: Record<string, unknown>;
-  validation?: Record<string, unknown>;
-  affectedSchedules?: string[];
-}
-
 export interface SchedulingServiceCreateInput {
   systemId: string;
   code: string;
@@ -223,14 +159,10 @@
   recurrence?: Recurrence;
   selectedDates?: string[];
   active?: boolean;
-  effectiveFrom?: string;
-  effectiveTo?: string | null;
   musicRequired?: boolean;
   protocolRequired?: boolean;
   maxChoirs?: number;
-  configVersionId?: string | null;
   displayOrder?: number;
-  supersedesId?: string | null;
   createdByPersonId: string;
 }
 
@@ -240,10 +172,6 @@
   name: string;
   description?: string;
   active?: boolean;
-  effectiveFrom?: string;
-  effectiveTo?: string | null;
-  configVersionId?: string | null;
-  supersedesId?: string | null;
   createdByPersonId: string;
 }
 
@@ -261,10 +189,6 @@
   minCount?: number | null;
   maxCount?: number | null;
   requireAll?: boolean;
-  configVersionId?: string | null;
-  effectiveFrom?: string;
-  effectiveTo?: string | null;
-  supersedesId?: string | null;
   createdByPersonId: string;
 }
 
@@ -278,10 +202,6 @@
   requireChoir?: boolean;
   requireWorship?: boolean;
   relaxableKinds?: string[];
-  configVersionId?: string | null;
-  effectiveFrom?: string;
-  effectiveTo?: string | null;
-  supersedesId?: string | null;
   createdByPersonId: string;
 }
 
@@ -295,10 +215,6 @@
   musicCompatibilityRequired?: boolean;
   leadershipPriorities?: string[];
   exceptionsAllowed?: boolean;
-  configVersionId?: string | null;
-  effectiveFrom?: string;
-  effectiveTo?: string | null;
-  supersedesId?: string | null;
   createdByPersonId: string;
 }
 
@@ -309,19 +225,16 @@
   weekday: r.weekday, time: r.time, recurrence: r.recurrence as Recurrence,
   selectedDates: parseJson(r.selectedDatesJson, [] as string[]),
   active: r.active,
-  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
   musicRequired: r.musicRequired, protocolRequired: r.protocolRequired,
-  maxChoirs: r.maxChoirs, targetTeamSize: r.targetTeamSize, configVersionId: r.configVersionId,
-  displayOrder: r.displayOrder, supersedesId: r.supersedesId,
+  maxChoirs: r.maxChoirs, targetTeamSize: r.targetTeamSize,
+  displayOrder: r.displayOrder,
   createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
 });
 
 export const toCategoryView = (r: ChoirCategory): ChoirCategoryView => ({
   id: r.id, systemId: r.systemId, code: r.code, name: r.name, description: r.description,
   active: r.active,
-  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
-  configVersionId: r.configVersionId,
-  supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
+  createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
 });
 
 export const toPolicyView = (r: CategoryServicePolicy): CategoryServicePolicyView => ({
@@ -333,9 +246,7 @@
   frequencyPeriod: r.frequencyPeriod as FrequencyPeriod | null,
   planningMode: r.planningMode as PlanningMode,
   minCount: r.minCount, maxCount: r.maxCount, requireAll: r.requireAll,
-  configVersionId: r.configVersionId,
-  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
-  supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
+  createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
 });
 
 export const toLinkView = (r: ChoirCategoryLink): ChoirCategoryLinkView => ({
@@ -343,9 +254,7 @@
   eligibleOverride: parseJson(r.eligibleOverrideJson, {}),
   frequencyOverride: parseJson(r.frequencyOverrideJson, {}),
   active: r.active,
-  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
-  configVersionId: r.configVersionId,
-  supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
+  createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
 });
 
 export const toProtocolRuleView = (r: ProtocolServiceRule): ProtocolServiceRuleView => ({
@@ -355,9 +264,7 @@
   teamSizeOverrides: parseJson(r.teamSizeOverridesJson, {} as Record<string, number>),
   requireChoir: r.requireChoir, requireWorship: r.requireWorship,
   relaxableKinds: parseJson(r.relaxableKindsJson, [] as string[]),
-  configVersionId: r.configVersionId,
-  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
-  supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
+  createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
 });
 
 export const toDutyPolicyView = (r: ProtocolDutyPolicy): ProtocolDutyPolicyView => ({
@@ -368,18 +275,7 @@
   musicCompatibilityRequired: r.musicCompatibilityRequired,
   leadershipPriorities: parseJson(r.leadershipPrioritiesJson, [] as string[]),
   exceptionsAllowed: r.exceptionsAllowed,
-  configVersionId: r.configVersionId,
-  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
-  supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
-});
-
-export const toConfigVersionView = (r: ConfigVersion): ConfigVersionView => ({
-  id: r.id, systemId: r.systemId, version: r.version, label: r.label, status: r.status as ConfigStatus,
-  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
   createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
-  reason: r.reason, previousVersionId: r.previousVersionId,
-  notes: parseJson(r.notesJson, {}), validation: parseJson(r.validationJson, {}),
-  affectedSchedules: parseJson(r.affectedSchedulesJson, [] as string[]),
 });
 
 /** Parse a JSON column safely, returning the default on failure. */
```

### `server/src/scheduling/choirRegisterSync.ts (diff)`
_Now only adds a missing active link to live config. Name kept so routes/music.ts is unchanged._

```diff
--- a/server/src/scheduling/choirRegisterSync.ts
+++ b/server/src/scheduling/choirRegisterSync.ts
@@ -1,33 +1,33 @@
 import type { Prisma } from '@prisma/client';
 import { prisma } from '../lib/prisma.js';
 
-type RegisterClient = Pick<Prisma.TransactionClient, 'configVersion' | 'musicChoir' | 'choirCategory' | 'choirCategoryLink'>;
-const REGISTER_TYPES = new Set(['PRIMARY', 'SECONDARY', 'CHILDREN', 'WORSHIP']);
+type RegisterClient = Pick<Prisma.TransactionClient, 'musicChoir' | 'choirCategory' | 'choirCategoryLink'>;
 
-/** Reconcile register types only into editable drafts; saved active/history pins stay untouched. */
-export async function syncChoirRegisterDrafts(db: RegisterClient = prisma, options: { versionId?: string; choirId?: string } = {}) {
-  const versions = await db.configVersion.findMany({ where: { systemId: 'sys-music', status: 'DRAFT', ...(options.versionId ? { id: options.versionId } : {}) } });
+/**
+ * Give a choir its category link when it has none, from its register type.
+ * Name kept (it used to reconcile DRAFT versions) so routes/music.ts does not change.
+ *
+ * With live configuration there is no draft to fill, so this now only ever ADDS a missing link
+ * to the live config. It never moves an existing link and never invents a category.
+ * Adding a link cannot make a valid configuration invalid, so it skips the edit lock and
+ * validation by design. TODO(confirm): previously a register-type change also re-pointed a
+ * link inside the draft; that reclassification is dropped because it would silently change live rules.
+ */
+export async function syncChoirRegisterDrafts(db: RegisterClient = prisma, options: { choirId?: string } = {}) {
   const choirs = await db.musicChoir.findMany({ where: { active: true, ...(options.choirId ? { id: options.choirId } : {}) } });
-  for (const version of versions) {
-    const scope = { systemId: 'sys-music', configVersionId: version.id };
-    const [categories, links] = await Promise.all([
-      db.choirCategory.findMany({ where: { ...scope, active: true } }),
-      db.choirCategoryLink.findMany({ where: scope }),
-    ]);
-    for (const choir of choirs) {
-      const category = categories.find(row => row.code.toUpperCase() === choir.role.toUpperCase());
-      if (!category) continue; // A leader must supply the matching category; never invent one.
-      const prior = links.filter(row => row.choirId === choir.id);
-      if (prior.length === 0) {
-        await db.choirCategoryLink.create({ data: { ...scope, choirId: choir.id, categoryId: category.id, active: true, effectiveFrom: new Date(), effectiveTo: null, supersedesId: null, eligibleOverrideJson: '{}', frequencyOverrideJson: '{}', createdByPersonId: version.createdByPersonId } });
-      } else if (prior.length === 1 && prior[0]!.active) {
-        const link = prior[0]!;
-        const previousCategory = categories.find(row => row.id === link.categoryId);
-        // Explicit custom-category choices and disabled links remain under leader control.
-        if (previousCategory && REGISTER_TYPES.has(previousCategory.code.toUpperCase()) && link.categoryId !== category.id) {
-          await db.choirCategoryLink.update({ where: { id: link.id }, data: { categoryId: category.id } });
-        }
-      }
-    }
+  const [categories, links] = await Promise.all([
+    db.choirCategory.findMany({ where: { systemId: 'sys-music', active: true } }),
+    db.choirCategoryLink.findMany({ where: { systemId: 'sys-music', active: true } }),
+  ]);
+  for (const choir of choirs) {
+    const category = categories.find((row) => row.code.toUpperCase() === choir.role.toUpperCase());
+    if (!category) continue; // A leader must supply the matching category; never invent one.
+    if (links.some((row) => row.choirId === choir.id)) continue;
+    await db.choirCategoryLink.create({
+      data: {
+        systemId: 'sys-music', choirId: choir.id, categoryId: category.id, active: true,
+        eligibleOverrideJson: '{}', frequencyOverrideJson: '{}', createdByPersonId: choir.createdById ?? 'system',
+      },
+    });
   }
 }
```

`server/src/scheduling/configuredEngine.ts`, `server/src/music/engine.ts`, `schedule.ts`, `store.ts`: **no change needed.** They never took a `configVersionId`; they receive the loaded config. Only the loaders changed.

### `server/src/routes/musicSchedule.ts (diff)`
_Live loaders; SCHEDULE_FROZEN guard; new drafts write configVersionId null._

```diff
--- a/server/src/routes/musicSchedule.ts
+++ b/server/src/routes/musicSchedule.ts
@@ -51,7 +51,8 @@
     .filter((month) => !excluded.has(month.periodKey))
     .map(({ services: monthServices, assignments }) => ({ services: monthServices, assignments }));
 }
-function validatePinnedMusic(
+/** Validate a schedule against the LIVE configuration (there is no pinned version any more). */
+function validateLiveMusic(
   services: MusicServiceSlot[],
   assignments: MusicAssignment[],
   units: readonly MusicScheduleUnit[],
@@ -59,9 +60,6 @@
   history: HistoricalSchedule[],
   allowManualIncomplete = false,
 ) {
-  if (!config.version) {
-    return { ok: false, warnings: [], reason: 'This schedule has no pinned Music configuration version. Rebuild it from a versioned draft before continuing.' };
-  }
   return validateConfiguredMusicSchedule({
     services, assignments, units, rules: configuredRules(config), history, allowManualIncomplete,
   });
@@ -124,16 +122,14 @@
     }));
 }
 
-/** Presentation metadata from the schedule's own pinned configuration, for planners. */
+/** Presentation metadata from the live configuration, for planners. */
 async function schedulePresentation(doc: Pick<MonthDoc, 'services' | 'assignments' | 'configVersionId'>, units: MusicScheduleUnit[], canWrite: boolean) {
-  const config = canWrite && doc.configVersionId ? await loadMusicConfig(doc.configVersionId) : null;
+  const config = canWrite ? await loadMusicConfig() : null;
   const categoryNames = new Map((config?.categories ?? []).map(row => [row.id, row.name]));
   const byChoir = new Map((config?.links ?? []).filter(row => row.active).map(row => [row.choirId, categoryNames.get(row.categoryId)]));
   return {
-    configVersionId: doc.configVersionId ?? null,
-    configLabel: config?.version?.label ?? null,
     rules: config?.policies.map(row => ({ ...row, categoryName: categoryNames.get(row.categoryId) ?? '', serviceCode: config.services.find(service => service.id === row.serviceId)?.code ?? '' })) ?? [],
-    validation: config ? validatePinnedMusic(doc.services, doc.assignments, units, config, historyOutside(doc.services, await loadMonths())) : null,
+    validation: config ? validateLiveMusic(doc.services, doc.assignments, units, config, historyOutside(doc.services, await loadMonths())) : null,
     services: serviceViews(doc.services, doc.assignments, units).map(service => ({
       ...service,
       requirements: config?.policies.filter(rule => rule.active && rule.eligible && config.services.find(row => row.id === rule.serviceId)?.code.toLowerCase() === service.kind.toLowerCase()).map(rule => ({
@@ -220,9 +216,11 @@
   const { horizon, start } = parsed.data;
   if (start < nowMonth()) return fail(res, 400, 'PAST', 'Choose a period from this month on');
   const units = unitsFrom(await loadChoirs());
-  // Pin the draft to the exact Music rules version used for generation.
+  // Configuration is live: whatever is saved now is what this draft is built from.
   const cfg = await loadMusicConfig();
-  if (!cfg.version) return fail(res, 409, 'NO_CONFIG', 'Activate a Music configuration version before generating a schedule.');
+  if (!cfg.services.some((service) => service.active && service.musicRequired)) {
+    return fail(res, 409, 'NO_CONFIG', 'Set up at least one Music service before generating a schedule.');
+  }
   let services: MusicServiceSlot[];
   try {
     services = buildMusicCalendar(start, horizon, cfg.services);
@@ -230,12 +228,23 @@
     if (error instanceof Error) return fail(res, 422, 'CONFIG', error.message);
     throw error;
   }
+  // Frozen schedules: a month that is already confirmed or published is immutable, and config edits never
+  // rebuild it. Only months with no schedule yet (or drafts, which live in MusicDraft) can be generated.
+  const frozen = new Set((await loadMonths()).filter((m) => m.state === 'CONFIRMED' || m.state === 'PUBLISHED').map((m) => m.periodKey));
+  const touched = [...new Set(services.map((service) => service.periodKey))].filter((month) => frozen.has(month));
+  if (touched.length) {
+    return res.status(409).json({
+      error: 'SCHEDULE_FROZEN',
+      message: 'This schedule is already confirmed. Edits to configuration do not rebuild confirmed or published schedules.',
+      months: touched, // extra detail for the UI; the two fields above are the contract
+    });
+  }
   const history = historyOutside(services, await loadMonths());
   const result = generateConfiguredMusicSchedule({
     services, units, rules: configuredRules(cfg), history, seed: parsed.data.seed,
   });
   if (!result.ok) return fail(res, 422, 'ENGINE', result.reason ?? 'Could not build a valid schedule');
-  const validation = validatePinnedMusic(services, result.assignments, units, cfg, history, true);
+  const validation = validateLiveMusic(services, result.assignments, units, cfg, history, true);
   if (!validation.ok) return fail(res, 422, 'CONFIG', validation.reason ?? 'Configuration policy violation');
   const fp = fingerprint(start, horizon, services, result.assignments);
   const dup = (await drafts()).map(draftDoc).find((d) => fingerprint(d.startMonth, d.horizon, d.services, d.assignments) === fp);
@@ -244,7 +253,7 @@
     data: {
       label: `${start} · ${horizon.toLowerCase()}`, horizon, startMonth: start, servicesJson: JSON.stringify(services), assignmentsJson: JSON.stringify(result.assignments),
       warningsJson: JSON.stringify([...result.warnings, ...validation.warnings]), createdById: g.me,
-      configVersionId: cfg.version?.id ?? null,
+      configVersionId: null, // no longer pinned; the column stays only for rows written before live configuration
     },
   })) as { id: string };
   await audit(g.me, 'DRAFT_GENERATED', `Generated a ${horizon.toLowerCase()} choir schedule from ${start}`, { draftId: row.id });
@@ -260,7 +269,7 @@
   assignments: MusicAssignment[],
   e: Edit,
   units: readonly MusicScheduleUnit[],
-  cfg: LoadedMusicConfig | null,
+  cfg: LoadedMusicConfig,
   history: HistoricalSchedule[],
   allowManualIncomplete = true,
 ) {
@@ -283,8 +292,7 @@
     next = now.map((x) => (x === e.unitId ? e.toUnitId! : x));
   }
   const after = withService(assignments, e.serviceId, next);
-  if (!cfg?.version) return { ok: false as const, status: 409, code: 'NO_CONFIG', error: 'This schedule has no pinned Music configuration version. Rebuild it from a versioned draft before editing.', warnings: [] };
-  const validation = validatePinnedMusic(services, after, units, cfg, history, allowManualIncomplete);
+  const validation = validateLiveMusic(services, after, units, cfg, history, allowManualIncomplete);
   if (!validation.ok) return { ok: false as const, status: 409, code: 'CONFIG', error: validation.reason ?? 'This breaks a configuration policy', warnings: validation.warnings };
   return { ok: true as const, assignments: after, warnings: validation.warnings };
 }
@@ -297,7 +305,7 @@
   const row = (await drafts()).find((d) => d.id === String(req.params.id));
   if (!row) return fail(res, 404, 'NOT_FOUND', 'Draft not found');
   const d = draftDoc(row);
-  const cfg = d.configVersionId ? await loadMusicConfig(d.configVersionId) : null;
+  const cfg = await loadMusicConfig();
   const history = historyOutside(d.services, await loadMonths());
   const r = applyEdit(d.services, d.assignments, parsed.data, unitsFrom(await loadChoirs()), cfg, history);
   if (!r.ok) return res.status(r.status).json({ error: r.error, code: r.code, warnings: 'warnings' in r ? r.warnings : [] });
@@ -327,13 +335,11 @@
 
 async function confirmMonths(me: string, row: DraftRow, chosen: string[]): Promise<{ ok: true } | { ok: false; status: number; code: string; error: string }> {
   const d = draftDoc(row);
-  const config = d.configVersionId ? await loadMusicConfig(d.configVersionId) : null;
+  const config = await loadMusicConfig();
   const units = unitsFrom(await loadChoirs());
-  const validation = config
-    ? validatePinnedMusic(d.services, d.assignments, units, config, historyOutside(d.services, await loadMonths()))
-    : { ok: false, reason: 'This draft has no pinned Music configuration version. Rebuild it from a versioned draft before confirming.' };
+  const validation = validateLiveMusic(d.services, d.assignments, units, config, historyOutside(d.services, await loadMonths()));
   if (!validation.ok) {
-    return { ok: false, status: 409, code: 'CONFIG', error: validation.reason ?? 'The draft does not satisfy its pinned Music configuration.' };
+    return { ok: false, status: 409, code: 'CONFIG', error: validation.reason ?? 'The draft does not satisfy the current Music configuration.' };
   }
   const have = monthsOf(d.services);
   if (chosen.length === 0) return { ok: false, status: 400, code: 'BAD_INPUT', error: 'Pick at least one month' };
@@ -389,13 +395,12 @@
   const units = unitsFrom(await loadChoirs());
   for (const month of chosen) {
     const doc = have.get(month)!;
-    const config = doc.configVersionId ? await loadMusicConfig(doc.configVersionId) : null;
-    if (!config) return { ok: false, status: 409, code: 'NO_CONFIG', error: `${month} has no pinned Music configuration version and cannot be published.` };
-    const validation = validatePinnedMusic(
+    const config = await loadMusicConfig();
+    const validation = validateLiveMusic(
       doc.services, doc.assignments, units, config, historyOutside(doc.services, allMonths),
     );
     if (!validation.ok) {
-      return { ok: false, status: 409, code: 'CONFIG', error: `${month}: ${validation.reason ?? 'The schedule does not satisfy its pinned Music configuration.'}` };
+      return { ok: false, status: 409, code: 'CONFIG', error: `${month}: ${validation.reason ?? 'The schedule does not satisfy the current Music configuration.'}` };
     }
   }
   const at = new Date();
@@ -432,11 +437,9 @@
   const already = months.filter((m) => existing.get(m)?.state === 'PUBLISHED');
   const fresh = months.filter((m) => !already.includes(m));
   const units = unitsFrom(await loadChoirs());
-  const config = d.configVersionId ? await loadMusicConfig(d.configVersionId) : null;
-  const validation = config
-    ? validatePinnedMusic(d.services, d.assignments, units, config, historyOutside(d.services, await loadMonths()))
-    : { ok: false, reason: 'This draft has no pinned Music configuration version and cannot be published.' };
-  if (!validation.ok) return fail(res, 409, 'CONFIG', validation.reason ?? 'The draft does not satisfy its pinned Music configuration.');
+  const config = await loadMusicConfig();
+  const validation = validateLiveMusic(d.services, d.assignments, units, config, historyOutside(d.services, await loadMonths()));
+  if (!validation.ok) return fail(res, 409, 'CONFIG', validation.reason ?? 'The draft does not satisfy the current Music configuration.');
   for (const m of months) {
     const slice = sliceMonth(d, m);
     if (slice.services.some((service) => service.musicRequired !== false) && slice.assignments.length === 0) {
@@ -479,7 +482,7 @@
   const before = (await loadMonths()).find((m) => m.periodKey === month);
   if (!before) return fail(res, 404, 'NOT_FOUND', 'No choir schedule for this month');
   const units = unitsFrom(await loadChoirs());
-  const cfg = before.configVersionId ? await loadMusicConfig(before.configVersionId) : null;
+  const cfg = await loadMusicConfig();
   const history = historyOutside(before.services, await loadMonths());
   const r = applyEdit(before.services, before.assignments, parsed.data, units, cfg, history, false);
   if (!r.ok) return res.status(r.status).json({ error: r.error, code: r.code, warnings: 'warnings' in r ? r.warnings : [] });
```

### `server/src/routes/protocol.ts (diff)`
_Live loaders; frozen guard; staleness-by-config removed; pin checks removed._

```diff
--- a/server/src/routes/protocol.ts
+++ b/server/src/routes/protocol.ts
@@ -15,13 +15,13 @@
 import { parse } from '../music/schedule.js';
 import {
   buildProtocolTeams, canServeKind, musicConflictCode, musicRequirements, scoreAttendanceRow, validateProtocolTeamsDetailed,
-  buildRulesFromConfig, targetTeamSizeFor,
+  buildRulesFromConfig, targetTeamSizeFor, SUPPORTED_PROTOCOL_KINDS,
 } from '../protocol/engine.js';
 import type {
   ProtocolIssue, ProtocolRosterMember, ProtocolSchedulingRules, ProtocolService, ProtocolServiceKind, ProtocolTeamSlot,
 } from '../protocol/types.js';
 import {
-  ATTENDANCE, KINDS, OFFICES, PROTOCOL, REASON_MAX, REASON_MIN, ROSTER_STATUS, SERVE_DAYS, TEXT_MAX, canReadPlan, canReadReports, canReadRoster,
+  ATTENDANCE, OFFICES, PROTOCOL, REASON_MAX, REASON_MIN, ROSTER_STATUS, SERVE_DAYS, TEXT_MAX, canReadPlan, canReadReports, canReadRoster,
   canWriteRoster, hasOffice, isCoordinator, isMonth, mayReview, rulesFor,
 } from '../protocol/rules.js';
 
@@ -128,8 +128,7 @@
   const planRow = ((await prisma.protocolPlan.findMany()) as PlanRow[]).find((p) => p.monthKey === month) ?? null;
   const { rows, members } = await rosterMembers();
   const slotRows = ((await prisma.protocolSlot.findMany()) as SlotRow[]).filter((s) => s.monthKey === month);
-  const musicConfigVersionId = planRow?.musicConfigVersionId ?? planned?.configVersionId ?? undefined;
-  const musicConfig = await loadMusicConfig(musicConfigVersionId);
+  const musicConfig = await loadMusicConfig();
   const categoryCodeById = new Map(musicConfig.categories.map((category) => [category.id, category.code]));
   const linksByChoir = new Map<string, string[]>();
   for (const link of musicConfig.links.filter((row) => row.active)) {
@@ -148,14 +147,14 @@
     if (!unitsOnService.has(a.serviceId)) unitsOnService.set(a.serviceId, new Set());
     unitsOnService.get(a.serviceId)!.add(a.unitId);
   }
-  // Load the active scheduling configuration (Phase 3 integration).
-  const protocolConfig = await loadProtocolConfig(planRow?.configVersionId ?? undefined, musicConfigVersionId);
+  // Live configuration: the rules as saved right now. Built plans do not re-read them to rebuild themselves.
+  const protocolConfig = await loadProtocolConfig();
   const unsupportedServices = (planned?.services ?? [])
-    .filter((service) => service.protocolRequired !== false && !(KINDS as readonly string[]).includes(service.kind))
+    .filter((service) => service.protocolRequired !== false && !(SUPPORTED_PROTOCOL_KINDS as readonly string[]).includes(service.kind))
     .map((service) => service.kind);
   const services: ProtocolService[] = (planned?.services ?? [])
     .filter((service) => {
-      if (service.protocolRequired === false || !(KINDS as readonly string[]).includes(service.kind)) return false;
+      if (service.protocolRequired === false || !(SUPPORTED_PROTOCOL_KINDS as readonly string[]).includes(service.kind)) return false;
       const definition = protocolConfig.services.find((row) => row.code.toUpperCase() === service.kind.toUpperCase());
       const rule = definition && protocolConfig.rules.find((row) => row.serviceId === definition.id);
       return rule?.required ?? true;
@@ -185,7 +184,7 @@
     protocolConfig.services,
   );
   const historyLoad = await publishedHistoryLoad(month);
-  return { month, planned, planRow, protocolConfig, musicConfig, musicConfigVersionId, unsupportedServices, missingProtocolRules, historyLoad, rosterRows: rows, roster: members, slotRows, slots: slotRows.map(slotOf), services, rules, choirUnits, unitsOnService, kindOf: (u: string) => kindById.get(u) };
+  return { month, planned, planRow, protocolConfig, musicConfig, unsupportedServices, missingProtocolRules, historyLoad, rosterRows: rows, roster: members, slotRows, slots: slotRows.map(slotOf), services, rules, choirUnits, unitsOnService, kindOf: (u: string) => kindById.get(u) };
 }
 type Ctx = Awaited<ReturnType<typeof monthCtx>>;
 
@@ -213,41 +212,18 @@
       if (JSON.stringify(base[k] ?? null) !== JSON.stringify(now[k] ?? null)) out.push(k);
     }
   }
-  if (c.planRow?.musicConfigVersionId &&
-      c.planned?.configVersionId &&
-      c.planRow.musicConfigVersionId !== c.planned.configVersionId) {
-    out.push('MUSIC_CONFIGURATION_VERSION_CHANGED');
-  }
-  if (c.planRow && c.planRow.status !== 'OPEN' && !c.planRow.musicConfigVersionId) {
-    out.push('MUSIC_CONFIGURATION_VERSION_UNPINNED');
-  }
+  // Removed by design: 'MUSIC_CONFIGURATION_VERSION_CHANGED' / '..._UNPINNED'. Music configuration is live, a
+  // built plan is a frozen copy, and what Music actually scheduled is still compared through the snapshot above.
   return out.sort();
 }
 
-async function ensurePlan(
-  month: string,
-  configVersionId?: string | null,
-  musicConfigVersionId?: string | null,
-): Promise<PlanRow> {
+async function ensurePlan(month: string): Promise<PlanRow> {
   const found = ((await prisma.protocolPlan.findMany()) as PlanRow[]).find((p) => p.monthKey === month);
-  if (found) {
-    if (found.status === 'OPEN' && ((!found.configVersionId && configVersionId) || (!found.musicConfigVersionId && musicConfigVersionId))) {
-      return (await prisma.protocolPlan.update({
-        where: { id: found.id },
-        data: {
-          ...(!found.configVersionId && configVersionId ? { configVersionId } : {}),
-          ...(!found.musicConfigVersionId && musicConfigVersionId ? { musicConfigVersionId } : {}),
-          updatedAt: new Date(),
-        },
-      })) as PlanRow;
-    }
-    return found;
-  }
-  const config = await loadProtocolConfig();
+  if (found) return found;
   return (await prisma.protocolPlan.create({ data: {
     monthKey: month, status: 'OPEN', version: 0, notesJson: '[]', overridesJson: '[]',
-    configVersionId: configVersionId ?? config.version?.id ?? null,
-    musicConfigVersionId: musicConfigVersionId ?? null,
+    // The two pin columns are historical only now: NULL on every new row.
+    configVersionId: null, musicConfigVersionId: null,
     updatedAt: new Date(),
   } })) as PlanRow;
 }
@@ -309,8 +285,8 @@
 const rosterBody = z.object({
   office: z.enum(OFFICES).optional(), serveDays: z.enum(SERVE_DAYS).optional(), status: z.enum(ROSTER_STATUS).optional(),
   unavailableDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(80).optional(),
-  allowedServiceKinds: z.array(z.enum(KINDS)).max(4).optional(),
-  onlyServices: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(KINDS) })).max(60).optional(),
+  allowedServiceKinds: z.array(z.enum(SUPPORTED_PROTOCOL_KINDS)).max(4).optional(),
+  onlyServices: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(SUPPORTED_PROTOCOL_KINDS) })).max(60).optional(),
   notes: z.string().max(300).optional(),
 });
 
@@ -425,7 +401,7 @@
   const status = c.planRow?.status ?? 'OPEN';
   res.json({
     month, step: stepOf(c), status, version: c.planRow?.version ?? 0, music: planned ? { state: planned.state, version: planned.version, configVersionId: planned.configVersionId ?? null } : null,
-    configVersionId: c.planRow?.configVersionId ?? null, musicConfigVersionId: c.musicConfigVersionId ?? null,
+    configVersionId: c.planRow?.configVersionId ?? null, musicConfigVersionId: c.planRow?.musicConfigVersionId ?? null,
     builtOnMusicVersion: c.planRow?.musicVersionBuiltOn ?? null, stale, notes: parse<string[]>(c.planRow?.notesJson, []),
     relax: { tuesday: c.planRow?.relaxTuesday ?? false, reason: c.planRow?.relaxReason ?? null },
     rules: { target: c.rules.preferTarget, hardMax: c.rules.hardMax, teamSize: c.rules.defaultTeamSize },
@@ -466,9 +442,17 @@
 async function generateMonth(req: AuthedRequest, res: Res, g: { me: string }, month: string) {
   void req;
   const c = await monthCtx(month);
+  // Frozen schedules: once teams are sent for review or published they are immutable, and configuration edits
+  // never rebuild them. Only an OPEN or DRAFT plan can be (re)generated.
+  // TODO(confirm): REVIEW counts as "confirmed" here (it is the Protocol equivalent of Music's CONFIRMED).
+  if (c.planRow && (c.planRow.status === 'REVIEW' || c.planRow.status === 'PUBLISHED')) {
+    return res.status(409).json({
+      error: 'SCHEDULE_FROZEN',
+      message: 'This schedule is already confirmed. Edits to configuration do not rebuild confirmed or published schedules.',
+    });
+  }
   if (!needMusic(c, res)) return;
-  if (!c.protocolConfig.version) return fail(res, 409, 'NO_PROTOCOL_CONFIG', 'Activate a Protocol configuration version before building teams.');
-  if (!c.musicConfigVersionId) return fail(res, 409, 'NO_MUSIC_CONFIG', 'The Music schedule has no pinned configuration version. Rebuild it from a versioned Music draft first.');
+  if (!c.protocolConfig.dutyPolicy && !c.protocolConfig.rules.length) return fail(res, 409, 'NO_PROTOCOL_CONFIG', 'Set up the Protocol team rules before building teams.');
   if (c.unsupportedServices.length) {
     return fail(res, 409, 'UNSUPPORTED_SERVICE', `Protocol is enabled for unsupported service codes: ${c.unsupportedServices.join(', ')}. Update the Protocol service rules before building teams.`);
   }
@@ -491,12 +475,10 @@
       },
     });
   }
-  const plan = await ensurePlan(month, c.protocolConfig.version.id, c.musicConfigVersionId);
+  const plan = await ensurePlan(month);
   await setPlan(plan.id, {
     status: 'DRAFT', generatedAt: new Date(), notesJson: JSON.stringify(warnings), musicVersionBuiltOn: c.planned!.version,
     musicSnapshotJson: JSON.stringify(snapshotOf(c)), musicStaleNotified: false, overridesJson: '[]', submittedAt: null, submittedById: null,
-    configVersionId: c.protocolConfig.version?.id ?? null,
-    musicConfigVersionId: c.musicConfigVersionId,
   });
   await audit(g.me, 'PROTOCOL_TEAMS_BUILT', `Built the teams for ${month}`, { month, slots: slots.length });
   res.json({ ok: true, slots: slots.length });
@@ -516,9 +498,9 @@
   if (!svc) return fail(res, 404, 'NO_SERVICE', 'No such service');
   const why = whyNot(c, svc, parsed.data.personId);
   if (why) return fail(res, 409, why, 'This person cannot be put on that service');
-  await ensurePlan(month, c.protocolConfig.version?.id, c.musicConfigVersionId);
+  await ensurePlan(month);
   await prisma.protocolSlot.create({ data: { monthKey: month, serviceId: svc.id, personId: parsed.data.personId, source: 'MANUAL', role: 'MEMBER', slotKind: monthlyLoad(c, parsed.data.personId) >= c.rules.softMax ? 'EXTRA' : 'REGULAR' } });
-  const plan = await ensurePlan(month, c.protocolConfig.version?.id, c.musicConfigVersionId);
+  const plan = await ensurePlan(month);
   if (plan.status === 'OPEN') await setPlan(plan.id, { status: 'DRAFT' });
   await audit(g.me, 'PROTOCOL_SLOT_ADD', `Added ${parsed.data.personId} to ${svc.label}`, { month, serviceId: svc.id, personId: parsed.data.personId });
   res.status(201).json({ ok: true });
@@ -599,7 +581,7 @@
   if (!issue) return fail(res, 404, 'NOT_FOUND', 'No such issue');
   if (!issue.canOverride) return fail(res, 409, 'NOT_OVERRIDABLE', 'Only the Music clashes can be overridden');
   const next = [...overridesOf(c).filter((o) => o.issueKey !== issue.key), { issueKey: issue.key, reason: parsed.data.reason, byPersonId: g.me, at: new Date().toISOString() }];
-  await setPlan((await ensurePlan(month, c.protocolConfig.version?.id, c.musicConfigVersionId)).id, { overridesJson: JSON.stringify(next) });
+  await setPlan((await ensurePlan(month)).id, { overridesJson: JSON.stringify(next) });
   await audit(g.me, 'PROTOCOL_OVERRIDE', `Allowed: ${issue.message}`, { month, key: issue.key, reason: parsed.data.reason });
   res.json({ ok: true });
 });
@@ -612,7 +594,7 @@
   if (!parsed.success || (parsed.data.on && (parsed.data.reason ?? '').length < REASON_MIN)) return fail(res, 400, 'REASON', 'Give a reason of at least five characters');
   const c = await monthCtx(month);
   if (!editable(c.planRow)) return fail(res, 409, 'LOCKED', 'Return the month to draft first');
-  const plan = await ensurePlan(month, c.protocolConfig.version?.id, c.musicConfigVersionId);
+  const plan = await ensurePlan(month);
   await setPlan(plan.id, parsed.data.on
     ? { relaxTuesday: true, relaxReason: parsed.data.reason, relaxedById: g.me, relaxedAt: new Date() }
     : { relaxTuesday: false, relaxReason: null, relaxedById: null, relaxedAt: null });
@@ -626,12 +608,6 @@
   if (!g || !month) return;
   const c = await monthCtx(month);
   if (!c.planRow || !c.planned) return fail(res, 409, 'NO_MUSIC', 'Nothing to confirm');
-  if (!c.planRow.musicConfigVersionId) {
-    return fail(res, 409, 'MUSIC_CONFIG_UNPINNED', 'Rebuild the Protocol teams against a versioned Music schedule before acknowledging changes.');
-  }
-  if (c.planned.configVersionId && c.planRow.musicConfigVersionId !== c.planned.configVersionId) {
-    return fail(res, 409, 'MUSIC_CONFIG_CHANGED', 'The Music configuration version changed. Rebuild the Protocol teams before continuing.');
-  }
   await setPlan(c.planRow.id, { musicSnapshotJson: JSON.stringify(snapshotOf(c)), musicVersionBuiltOn: c.planned.version, musicStaleNotified: false });
   res.json({ ok: true });
 });
@@ -642,9 +618,6 @@
   if (!g || !month) return;
   const c = await monthCtx(month);
   if (!c.planRow || c.planRow.status !== 'DRAFT' || !c.slots.length) return fail(res, 409, 'NOT_DRAFT', 'Build the teams first');
-  if (!c.planRow.configVersionId || !c.planRow.musicConfigVersionId) {
-    return fail(res, 409, 'CONFIG_UNPINNED', 'Rebuild the teams from pinned Protocol and Music configuration versions before review.');
-  }
   if (blockingOf(c).length) return fail(res, 409, 'BLOCKING', 'Fix or allow the blocking issues first');
   await setPlan(c.planRow.id, { status: 'REVIEW', submittedAt: new Date(), submittedById: g.me });
   await tellOffice('PRESIDENT', 'WAITING_FOR_ME', `Protocol teams for ${month}`, 'The Coordinator sent the teams for your review.', `protocol:review:${month}:${c.planRow.version}`);
@@ -677,9 +650,6 @@
   const presidentActive = c.roster.some((r) => r.office === 'PRESIDENT' && r.status === 'ACTIVE');
   if (!mayReview(g.me, g.data, presidentActive)) return fail(res, 403, 'FORBIDDEN', 'Only the President reviews and publishes');
   if (!c.planRow || c.planRow.status !== 'REVIEW') return fail(res, 409, 'NOT_IN_REVIEW', 'Nothing waiting for review');
-  if (!c.planRow.configVersionId || !c.planRow.musicConfigVersionId) {
-    return fail(res, 409, 'CONFIG_UNPINNED', 'This plan has no pinned Protocol and Music configuration versions. Rebuild the teams before publishing.');
-  }
   if (c.planRow.submittedById === g.me) return fail(res, 409, 'SAME_PERSON', 'The reviewer must not be the person who sent it');
   if (!c.planned || c.planned.state !== 'PUBLISHED') return fail(res, 409, 'MUSIC_NOT_PUBLISHED', 'Music must publish the month first');
   if (staleOf(c).length) return fail(res, 409, 'MUSIC_CHANGED', 'Music changed since the teams were built');
```

## 7. Frozen-schedule guards

Both in the diffs above. Music generate returns 409 `SCHEDULE_FROZEN` when the target month is CONFIRMED or PUBLISHED. Protocol generate does the same when the plan is in REVIEW or PUBLISHED. Message: *This schedule is already confirmed. Edits to configuration do not rebuild confirmed or published schedules.* State-transition logic is untouched.

## 8. UI

### `src/newdesign/DoorSchedulingConfigPage.tsx`
_Lock on mount, 60s heartbeat, release on unmount/pagehide, holder banner, beforeunload and router blocker on dirty, three-tab wizard, no Versions tab._

```tsx
import { MusicParticipationEditor } from "./MusicParticipationEditor";
import { Link, UNSAFE_DataRouterContext, useBlocker, useParams, useSearchParams } from "react-router-dom";
import { useContext, useEffect, useRef, useState } from "react";
import { SchedulingSetupContext } from './SchedulingSetupContext';
import {
  acquireConfigLock, fetchConfigValidation, refreshConfigLock, releaseConfigLock,
  type ConfigLockHolder,
} from "../api/frontDoorApi";
import { ApiError } from "../api/client";
import { useT } from "../i18n/I18nContext";
import { useFrontDoor } from "./FrontDoorContext";
import { LoadState } from "./LoadState";
import { useLoad } from "./useLoad";
import { ConfirmDialog, PageHeader, StatusChip } from "./kit";
import {
  CategoriesEditor,
  LinksEditor,
  PoliciesEditor,
  ProtocolDutyEditor,
  ProtocolRulesEditor,
  ServicesEditor,
} from "./SchedulingConfigEditors";
import {
  configTabsForSystem,
  configTabKey,
  MUSIC_SETUP_STEPS, musicSetupStep,
} from "./config";

/**
 * Configuration is LIVE: every save applies at once and is picked up by the next generate call.
 * There are no drafts, versions or activation. Because nothing isolates an edit, the server lets one
 * person edit at a time (see server/src/scheduling/editLock.ts). This page takes that lock on mount,
 * keeps it alive while open, and gives it back on leave.
 */
const HEARTBEAT_MS = 60_000; // lock TTL is 15 minutes; refresh well inside it

type LockState = 'pending' | 'held' | 'blocked' | 'lost' | 'readonly';

// Serializes release -> acquire so React StrictMode's mount/unmount/mount cannot let a late release
// delete the lock that the second mount just took.
let lastRelease: Promise<unknown> = Promise.resolve();

/** Only mounted under a data router (useBlocker throws under <BrowserRouter>). */
function LeaveGuard({ when }: { when: boolean }) {
  const t = useT();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname);
  return <ConfirmDialog open={blocker.state === 'blocked'} title={t('door.config.leave.title')} body={t('door.config.setup.unsaved')}
    confirmLabel={t('door.config.leave.confirm')} onConfirm={() => blocker.proceed?.()} onCancel={() => blocker.reset?.()} />;
}

export function DoorSchedulingConfigPage() {
  const t = useT();
  const { capabilities } = useFrontDoor();
  const { systemId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasDataRouter = !!useContext(UNSAFE_DataRouterContext);
  const tabs = configTabsForSystem(systemId);
  const isMusic = systemId === 'sys-music';
  const [unsaved, setUnsaved] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const [lock, setLock] = useState<LockState>('pending');
  const [holder, setHolder] = useState<ConfigLockHolder | null>(null);
  const configAccess = capabilities?.systems.find((system) => system.id === systemId)
    ?.own?.find((block) => block.key === "config")?.letters ?? [];
  const mayEdit = configAccess.includes("W");
  // Editors only get canWrite when the person may edit AND holds the lock.
  const canWrite = mayEdit && lock === 'held';
  const validation = useLoad(() => fetchConfigValidation(systemId), `sched-config-validation|${systemId}`);
  const requestedTab = searchParams.get("tab");
  const tab = tabs.find((candidate) => candidate === requestedTab) ?? "services";
  const step = musicSetupStep(tab);
  const stepKeys = ['services', 'choirs', 'rules'] as const;

  // Lock lifecycle: acquire on mount, heartbeat while open, release on unmount or pagehide.
  const holding = useRef(false);
  useEffect(() => {
    if (!systemId || !mayEdit) { setLock('readonly'); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tryAcquire = async () => {
      try {
        await acquireConfigLock(systemId);
        holding.current = true;
        if (!cancelled) { setLock('held'); setHolder(null); }
        return true;
      } catch (reason) {
        holding.current = false;
        if (cancelled) return false;
        const body = reason instanceof ApiError ? reason.body as { holder?: ConfigLockHolder } | undefined : undefined;
        setHolder(body?.holder ?? null);
        setLock('blocked');
        return false;
      }
    };
    setLock('pending');
    void lastRelease.then(async () => {
      if (cancelled || !(await tryAcquire()) || cancelled) return;
      timer = setInterval(() => {
        void refreshConfigLock(systemId).catch(async () => {
          // Expired or taken over while idle: try to take it back; otherwise show who has it.
          if (!(await tryAcquire()) && !cancelled) setLock((s) => s === 'blocked' ? s : 'lost');
        });
      }, HEARTBEAT_MS);
    });
    const onHide = () => { if (holding.current) { holding.current = false; void releaseConfigLock(systemId).catch(() => {}); } };
    window.addEventListener('pagehide', onHide);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener('pagehide', onHide);
      if (holding.current) { holding.current = false; lastRelease = releaseConfigLock(systemId).catch(() => {}); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemId, mayEdit]);

  // Unsaved edits in a form: warn on tab close / reload. In-app navigation is guarded by <LeaveGuard/>.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const selectTab = (nextTab: string) => {
    if (unsaved) { setNavigationError(t('door.config.setup.unsaved')); return; }
    setNavigationError('');
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("tab", nextTab);
      return next;
    });
  };
  const systemName = systemId === "sys-music" ? t("door.config.system.music")
    : systemId === "sys-protocol" ? t("door.config.system.protocol")
      : t("door.config.system.unknown");
  const tabCopyKey = `door.config.intro.${systemId === "sys-protocol" ? "protocol" : "music"}.${tab}` as Parameters<typeof t>[0];
  const holderName = holder?.name ?? t('door.config.lock.someone');

  return (
    <section className="door-block scheduling-config" aria-labelledby="door-config-title">
      <PageHeader id="door-config-title" title={t("door.config.title")}
        meta={<StatusChip tone="info">{systemName}</StatusChip>} />
      <p><Link className="btn ghost sm" to={systemId === "sys-music" ? "/s/sys-music/monthplan" : "/s/sys-protocol/teams"}>{t("door.scheduling.workspace")}</Link></p>
      <p className="scheduling-config-intro">{t("door.config.intro")}</p>
      <p className="muted" role="note">{t('door.config.live')}</p>
      {lock === 'blocked' && <p className="door-error" role="alert">{t('door.config.lock.heldBy', { name: holderName })}</p>}
      {lock === 'lost' && <p className="door-error" role="alert">{t('door.config.lock.lost')}</p>}
      {mayEdit && lock === 'held' && <p className="muted" role="status">{t('door.config.lock.mine')}</p>}
      {!mayEdit && <p className="muted" role="status">{t('door.config.readOnly')}</p>}
      {validation.data && !validation.data.ok && <div className="panel" role="status">
        <strong>{t('door.config.validation.heading')}</strong>
        <ul className="door-list">{validation.data.errors.map((message) => <li key={message}>{message}</li>)}</ul>
      </div>}
      {isMusic ? <nav className="scheduling-steps" aria-label={t('door.config.setup.steps')}>
        {MUSIC_SETUP_STEPS.map((key, index) => <button key={key} type="button" className={'btn ' + (index === step ? '' : 'ghost')}
          aria-current={index === step ? 'step' : undefined} onClick={() => selectTab(key)}>
          <span>{index + 1}</span> {t(`door.config.step.${stepKeys[index]}`)}
        </button>)}
      </nav> : <nav className="door-menu" aria-label={t("door.config.tabs")}>
        {tabs.map((key) => (
          <button key={key} type="button" className={"door-menu-link" + (tab === key ? " active" : "")}
            aria-current={tab === key ? "page" : undefined} onClick={() => selectTab(key)}>
            {t(configTabKey(key))}
          </button>
        ))}
      </nav>}
      {navigationError && <p className="door-error" role="alert">{navigationError}</p>}
      <header className="scheduling-config-section">
        <h3>{isMusic ? t(`door.config.setup.question.${stepKeys[step]}`) : t(configTabKey(tab))}</h3>
        {isMusic ? <p>{t('door.config.setup.progress', { step: step + 1 })}</p> : <p className="muted">{t(tabCopyKey)}</p>}
      </header>
      <LoadState loading={lock === 'pending' && mayEdit} failed={false} retry={() => {}}>
        <SchedulingSetupContext.Provider value={{ saved: () => { setUnsaved(false); setNavigationError(''); validation.reload(); }, changed: () => setUnsaved(true) }}>
          <div onChangeCapture={() => setUnsaved(true)}>
            {tab === "services" && <ServicesEditor systemId={systemId} canWrite={canWrite} />}
            {isMusic && step === 1 && <>
              <LinksEditor systemId={systemId} canWrite={canWrite} />
              <details open={tab === 'categories'} className="scheduling-config-advanced"><summary>{t('door.config.setup.categories')}</summary>
                <CategoriesEditor systemId={systemId} canWrite={canWrite} />
              </details>
            </>}
            {isMusic && step === 2 && <>
              <PoliciesEditor systemId={systemId} canWrite={canWrite} />
              {(['fixed', 'availability'] as const).map(mode => <details key={mode} className="scheduling-config-advanced" open={tab === mode}>
                <summary>{t(configTabKey(mode))}</summary><MusicParticipationEditor key={mode} mode={mode} canWrite={canWrite} />
              </details>)}
            </>}
            {tab === "protocol" && <ProtocolRulesEditor systemId={systemId} canWrite={canWrite} />}
            {tab === "duty" && <ProtocolDutyEditor systemId={systemId} canWrite={canWrite} />}
          </div>
        </SchedulingSetupContext.Provider>
      </LoadState>
      {isMusic && <div className="door-row scheduling-step-actions">
        {step > 0 && <button type="button" className="btn ghost" onClick={() => selectTab(MUSIC_SETUP_STEPS[step - 1])}>{t('door.config.setup.back')}</button>}
        {step < MUSIC_SETUP_STEPS.length - 1 && <button type="button" className="btn" onClick={() => selectTab(MUSIC_SETUP_STEPS[step + 1])}>{t('door.config.setup.continue')}</button>}
      </div>}
      {hasDataRouter && <LeaveGuard when={unsaved} />}
    </section>
  );
}
```

### `src/newdesign/SchedulingConfigEditors.tsx (diff)`
_Version, draft and activate plumbing removed._

```diff
--- a/src/newdesign/SchedulingConfigEditors.tsx
+++ b/src/newdesign/SchedulingConfigEditors.tsx
@@ -26,7 +26,6 @@
   type CategoryServicePolicyApi,
   type ChoirCategoryApi,
   type ChoirCategoryLinkApi,
-  type ConfigVersionApi,
   type ProtocolServiceRuleApi,
   type SchedulingServiceApi,
 } from "../api/frontDoorApi";
@@ -42,9 +41,9 @@
 } from "./config";
 import { StatusChip } from "./kit";
 
+/** canWrite means: the person may edit AND holds the edit lock (the page works that out). */
 type Props = {
   systemId: string;
-  version: ConfigVersionApi | undefined;
   canWrite: boolean;
 };
 
@@ -224,41 +223,20 @@
   );
 }
 
-export function ServicesEditor({ systemId, version, canWrite, onRequestEdit, preparing, intent, onIntentHandled }: Props & {
-  onRequestEdit?: (code: string | null) => Promise<void>;
-  preparing?: boolean;
-  intent?: { code: string | null } | null;
-  onIntentHandled?: () => void;
-}) {
+export function ServicesEditor({ systemId, canWrite }: Props) {
   const t = useT();
   const isMusic = systemId === "sys-music";
-  const configVersionId = isMusic ? version?.id : undefined;
-  const editable = canWrite && isMusic && version?.status === "DRAFT";
-  const list = useLoad(() => fetchSchedulingServices(systemId, false, configVersionId), `sched-config-services|${systemId}|${configVersionId ?? "active"}`);
+  const editable = canWrite && isMusic;
+  const list = useLoad(() => fetchSchedulingServices(systemId, false), `sched-config-services|${systemId}`);
   const state = useSaveState();
   const [formOpen, setFormOpen] = useState(false);
   const [editing, setEditing] = useState<SchedulingServiceApi | null>(null);
   const rows = list.data?.services ?? [];
-  useEffect(() => {
-    if (!intent || !editable || !list.data || list.loading || list.failed) return;
-    const row = intent.code === null ? null : rows.find((service) => service.code === intent.code);
-    if (intent.code !== null && !row) {
-      state.fail(new Error(t("door.config.service.missingInDraft")));
-    } else {
-      setEditing(row ?? null);
-      setFormOpen(true);
-      state.clear();
-    }
-    onIntentHandled?.();
-  });
   const openEditor = (row: SchedulingServiceApi | null) => {
-    if (preparing) return;
-    if (!editable) { void onRequestEdit?.(row?.code ?? null); return; }
     setEditing(row); setFormOpen(true); state.clear();
   };
   const cancel = (clear = true) => { setEditing(null); setFormOpen(false); if (clear) state.clear(); };
   const submit = async (data: FormData) => {
-    if (!configVersionId) return;
     const patch = {
       code: str(data, "code") || `SERVICE_${crypto.randomUUID().slice(0,8)}`, name: str(data, "name"), kind: str(data, "kind"),
       weekday: num(data, "weekday"), time: str(data, "time") || null,
@@ -270,8 +248,8 @@
     };
     const ok = await state.run(
       () => editing
-        ? updateSchedulingService(editing.id, configVersionId, patch)
-        : createSchedulingService({ ...patch, systemId: "sys-music", configVersionId }),
+        ? updateSchedulingService(editing.id, patch)
+        : createSchedulingService({ ...patch, systemId: "sys-music" }),
       list.reload,
     );
     if (ok) cancel(false);
@@ -280,7 +258,7 @@
     <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
       {!isMusic && <SectionNotice>{t("door.config.sharedCalendarReadOnly")}</SectionNotice>}
       {canWrite && isMusic && !formOpen && <>
-        <button type="button" className="btn sm" disabled={preparing} onClick={() => openEditor(null)}>{t("door.config.add")}</button>
+        <button type="button" className="btn sm" onClick={() => openEditor(null)}>{t("door.config.add")}</button>
       </>}
       <FormNotice state={state} />
       <EmptyOrLocked canEdit={editable} empty={rows.length === 0} emptyKey="door.config.services.empty" />
@@ -305,7 +283,7 @@
                 {t("door.config.service.teamSize", { count: row.targetTeamSize })}
               </StatusChip>}
             </div>
-            {canWrite && isMusic && <button type="button" className="btn ghost sm" disabled={preparing} onClick={() => openEditor(row)}>{t("door.settings.edit")}</button>}
+            {canWrite && isMusic && <button type="button" className="btn ghost sm" onClick={() => openEditor(row)}>{t("door.settings.edit")}</button>}
           </div>
         </li>)}
       </ul>
@@ -336,22 +314,20 @@
   );
 }
 
-export function CategoriesEditor({ systemId, version, canWrite }: Props) {
+export function CategoriesEditor({ systemId, canWrite }: Props) {
   const t = useT();
-  const versionId = version?.id;
-  const editable = canWrite && systemId === "sys-music" && version?.status === "DRAFT";
-  const list = useLoad(() => fetchChoirCategories(systemId, false, versionId), `sched-config-cats|${systemId}|${versionId ?? "active"}`);
+  const editable = canWrite && systemId === "sys-music";
+  const list = useLoad(() => fetchChoirCategories(systemId, false), `sched-config-cats|${systemId}`);
   const state = useSaveState();
   const [formOpen, setFormOpen] = useState(false);
   const [editing, setEditing] = useState<ChoirCategoryApi | null>(null);
   const rows = list.data?.categories ?? [];
   const cancel = (clear = true) => { setEditing(null); setFormOpen(false); if (clear) state.clear(); };
   const submit = async (data: FormData) => {
-    if (!versionId) return;
     const patch = { code: str(data, "code"), name: str(data, "name"), description: str(data, "description"), active: flag(data, "active") };
     const ok = await state.run(
-      () => editing ? updateChoirCategory(editing.id, versionId, patch)
-        : createChoirCategory({ ...patch, systemId: "sys-music", configVersionId: versionId }),
+      () => editing ? updateChoirCategory(editing.id, patch)
+        : createChoirCategory({ ...patch, systemId: "sys-music" }),
       list.reload,
     );
     if (ok) cancel(false);
@@ -384,20 +360,18 @@
   );
 }
 
-export function PoliciesEditor({ systemId, version, canWrite }: Props) {
+export function PoliciesEditor({ systemId, canWrite }: Props) {
   const t = useT();
-  const versionId = version?.id;
-  const editable = canWrite && systemId === "sys-music" && version?.status === "DRAFT";
-  const list = useLoad(() => fetchCategoryServicePolicies(systemId, versionId), `sched-config-policies|${systemId}|${versionId ?? "active"}`);
-  const categories = useLoad(() => fetchChoirCategories(systemId, false, versionId), `sched-config-policy-cats|${versionId ?? "active"}`);
-  const services = useLoad(() => fetchSchedulingServices(systemId, false, versionId), `sched-config-policy-services|${versionId ?? "active"}`);
+  const editable = canWrite && systemId === "sys-music";
+  const list = useLoad(() => fetchCategoryServicePolicies(systemId), `sched-config-policies|${systemId}`);
+  const categories = useLoad(() => fetchChoirCategories(systemId, false), `sched-config-policy-cats`);
+  const services = useLoad(() => fetchSchedulingServices(systemId, false), `sched-config-policy-services`);
   const state = useSaveState();
   const [formOpen, setFormOpen] = useState(false);
   const [editing, setEditing] = useState<CategoryServicePolicyApi | null>(null);
   const rows = list.data?.policies ?? [];
   const cancel = (clear = true) => { setEditing(null); setFormOpen(false); if (clear) state.clear(); };
   const submit = async (data: FormData) => {
-    if (!versionId) return;
     const target = str(data, "frequencyTarget");
     const minimum = str(data, "minCount");
     const maximum = str(data, "maxCount");
@@ -413,8 +387,8 @@
       throw new Error(t("door.config.err.minMax"));
     }
     const ok = await state.run(
-      () => editing ? updateCategoryServicePolicy(editing.id, versionId, patch)
-        : createCategoryServicePolicy({ ...patch, systemId: "sys-music", configVersionId: versionId }),
+      () => editing ? updateCategoryServicePolicy(editing.id, patch)
+        : createCategoryServicePolicy({ ...patch, systemId: "sys-music" }),
       list.reload,
     );
     if (ok) cancel(false);
@@ -473,12 +447,11 @@
   );
 }
 
-export function LinksEditor({ systemId, version, canWrite }: Props) {
+export function LinksEditor({ systemId, canWrite }: Props) {
   const t = useT();
-  const versionId = version?.id;
-  const editable = canWrite && systemId === "sys-music" && version?.status === "DRAFT";
-  const list = useLoad(() => fetchChoirCategoryLinks(systemId, versionId), `sched-config-links|${systemId}|${versionId ?? "active"}`);
-  const categories = useLoad(() => fetchChoirCategories(systemId, false, versionId), `sched-config-link-cats|${versionId ?? "active"}`);
+  const editable = canWrite && systemId === "sys-music";
+  const list = useLoad(() => fetchChoirCategoryLinks(systemId), `sched-config-links|${systemId}`);
+  const categories = useLoad(() => fetchChoirCategories(systemId, false), `sched-config-link-cats`);
   const choirs = useChoirRegister(undefined, "sched-config-link-choirs");
   useChoirRegisterRefresh(list.reload);
   const state = useSaveState();
@@ -487,15 +460,14 @@
   const rows = list.data?.links ?? [];
   const cancel = (clear = true) => { setEditing(null); setFormOpen(false); if (clear) state.clear(); };
   const submit = async (data: FormData) => {
-    if (!versionId) return;
     const patch = {
       choirId: str(data, "choirId"), categoryId: str(data, "categoryId"),
       ...musicExceptions(data, editing),
       active: flag(data, "active"),
     };
     const ok = await state.run(
-      () => editing ? updateChoirCategoryLink(editing.id, versionId, patch)
-        : createChoirCategoryLink({ ...patch, systemId: "sys-music", configVersionId: versionId }),
+      () => editing ? updateChoirCategoryLink(editing.id, patch)
+        : createChoirCategoryLink({ ...patch, systemId: "sys-music" }),
       list.reload,
     );
     if (ok) cancel(false);
@@ -534,18 +506,17 @@
           options={(choirs.data?.choirs ?? []).filter((row) => row.active || row.id === editing?.choirId).map((row) => ({ value: row.id, label: row.name }))} />
         <SelectField label={t("door.config.link.category")} name="categoryId" value={editing?.categoryId} required
           options={(categories.data?.categories ?? []).map((row) => ({ value: row.id, label: row.name }))} />
-        <ChoirExceptions versionId={versionId ?? ""} link={editing} />
+        <ChoirExceptions link={editing} />
         <CheckField label={t("door.config.service.active")} name="active" checked={editing?.active ?? true} />
       </SaveForm>}
     </LoadState>
   );
 }
 
-export function ProtocolRulesEditor({ systemId, version, canWrite }: Props) {
+export function ProtocolRulesEditor({ systemId, canWrite }: Props) {
   const t = useT();
-  const versionId = version?.id;
-  const editable = canWrite && systemId === "sys-protocol" && version?.status === "DRAFT";
-  const list = useLoad(() => fetchProtocolServiceRules(systemId, versionId), `sched-config-protocol|${systemId}|${versionId ?? "active"}`);
+  const editable = canWrite && systemId === "sys-protocol";
+  const list = useLoad(() => fetchProtocolServiceRules(systemId), `sched-config-protocol|${systemId}`);
   const services = useLoad(() => fetchSchedulingServices("sys-protocol"), "sched-config-protocol-services");
   const state = useSaveState();
   const [formOpen, setFormOpen] = useState(false);
@@ -553,7 +524,6 @@
   const rows = list.data?.rules ?? [];
   const cancel = () => { setEditing(null); setFormOpen(false); state.clear(); };
   const submit = async (data: FormData) => {
-    if (!versionId) return;
     const dates = data.getAll("overrideDate").map((value) => String(value).trim());
     const sizes = data.getAll("overrideSize").map((value) => String(value).trim());
     const teamSizeOverrides: Record<string, number> = {};
@@ -576,8 +546,8 @@
       relaxableKinds: preserveRelaxableKinds(editing?.relaxableKinds ?? [], data.getAll("relaxableKind").map(String)),
     };
     const ok = await state.run(
-      () => editing ? updateProtocolServiceRule(editing.id, versionId, patch)
-        : createProtocolServiceRule({ ...patch, systemId: "sys-protocol", configVersionId: versionId }),
+      () => editing ? updateProtocolServiceRule(editing.id, patch)
+        : createProtocolServiceRule({ ...patch, systemId: "sys-protocol" }),
       list.reload,
     );
     if (ok) cancel();
@@ -626,15 +596,13 @@
   );
 }
 
-export function ProtocolDutyEditor({ systemId, version, canWrite }: Props) {
+export function ProtocolDutyEditor({ systemId, canWrite }: Props) {
   const t = useT();
-  const versionId = version?.id;
-  const editable = canWrite && systemId === "sys-protocol" && version?.status === "DRAFT";
-  const policy = useLoad(() => fetchProtocolDutyPolicy(systemId, versionId), `sched-config-duty|${systemId}|${versionId ?? "active"}`);
+  const editable = canWrite && systemId === "sys-protocol";
+  const policy = useLoad(() => fetchProtocolDutyPolicy(systemId), `sched-config-duty|${systemId}`);
   const state = useSaveState();
   const row = policy.data?.policy ?? null;
   const submit = async (data: FormData) => {
-    if (!versionId) return;
     const patch = {
       preferTarget: num(data, "preferTarget", 3), softMax: num(data, "softMax", 3), hardMax: num(data, "hardMax", 4),
       extraDutyPolicy: str(data, "extraDutyPolicy"),
@@ -649,8 +617,8 @@
     }
     await state.run(
       () => row
-        ? updateProtocolDutyPolicy(row.id, versionId, patch)
-        : createProtocolDutyPolicy({ ...patch, systemId: "sys-protocol", configVersionId: versionId }),
+        ? updateProtocolDutyPolicy(row.id, patch)
+        : createProtocolDutyPolicy({ ...patch, systemId: "sys-protocol" }),
       policy.reload,
     );
   };
@@ -690,9 +658,9 @@
   );
 }
 
-function ChoirExceptions({ versionId, link }: { versionId: string; link: ChoirCategoryLinkApi | null }) {
+function ChoirExceptions({ link }: { link: ChoirCategoryLinkApi | null }) {
   const t = useT();
-  const services = useLoad(() => fetchSchedulingServices('sys-music', true, versionId), 'sched-exceptions|' + versionId);
+  const services = useLoad(() => fetchSchedulingServices('sys-music', true), 'sched-exceptions');
   return <details className="scheduling-config-advanced"><summary>{t('door.config.exceptions')}</summary><LoadState loading={services.loading} failed={services.failed} retry={services.reload}>
     {(services.data?.services ?? []).map(service => {
       const get = (map: Record<string, unknown> | undefined) => Object.entries(map ?? {}).find(([key]) => key.toLowerCase() === service.code.toLowerCase())?.[1];
```

### `src/newdesign/MusicParticipationEditor.tsx (diff)`
_No version prop; editable = canWrite._

```diff
--- a/src/newdesign/MusicParticipationEditor.tsx
+++ b/src/newdesign/MusicParticipationEditor.tsx
@@ -1,23 +1,23 @@
 import { useChoirRegister } from './useChoirRegister';
 import { useContext, useState } from 'react';
 import { SchedulingSetupContext } from './SchedulingSetupContext';
-import { addMusicAvailability, addMusicFixedAssignment, fetchMusicAvailability, fetchMusicFixedAssignments, fetchCategoryServicePolicies, fetchSchedulingServices, removeMusicAvailability, removeMusicFixedAssignment, type ConfigVersionApi } from '../api/frontDoorApi';
+import { addMusicAvailability, addMusicFixedAssignment, fetchMusicAvailability, fetchMusicFixedAssignments, fetchCategoryServicePolicies, fetchSchedulingServices, removeMusicAvailability, removeMusicFixedAssignment } from '../api/frontDoorApi';
 import { useT } from '../i18n/I18nContext';
 import { LoadState } from './LoadState';
 import { useLoad } from './useLoad';
 import { schedulingError } from './schedulingForms';
 import { EmptyState } from './kit';
 
-export function MusicParticipationEditor({ mode, version, canWrite }: { mode: 'fixed' | 'availability'; version?: ConfigVersionApi; canWrite: boolean }) {
-  const t = useT(), id = version?.id ?? '';
+export function MusicParticipationEditor({ mode, canWrite }: { mode: 'fixed' | 'availability'; canWrite: boolean }) {
+  const t = useT();
   const setup = useContext(SchedulingSetupContext);
   const [fixedWhen,setFixedWhen] = useState('SERVICE'), [busy, setBusy] = useState(false), [error, setError] = useState('');
   const choirs = useChoirRegister(undefined, 'participation-choirs');
-  const services = useLoad(() => fetchSchedulingServices('sys-music', false, mode === 'fixed' ? id : undefined), 'participation-services|' + mode + id);
-  const policies = useLoad(() => fetchCategoryServicePolicies('sys-music', id), 'participation-policies|' + id);
-  const fixed = useLoad(() => mode === 'fixed' && id ? fetchMusicFixedAssignments(id) : Promise.resolve({ assignments: [] }), 'participation-fixed|' + id + mode);
+  const services = useLoad(() => fetchSchedulingServices('sys-music', false), 'participation-services|' + mode);
+  const policies = useLoad(() => fetchCategoryServicePolicies('sys-music'), 'participation-policies');
+  const fixed = useLoad(() => mode === 'fixed' ? fetchMusicFixedAssignments() : Promise.resolve({ assignments: [] }), 'participation-fixed|' + mode);
   const away = useLoad(() => mode === 'availability' ? fetchMusicAvailability() : Promise.resolve({ availability: [] }), 'participation-away|' + mode);
-  const editable = canWrite && (mode === 'availability' || version?.status === 'DRAFT');
+  const editable = canWrite;
   const choirName = (choirId: string) => choirs.data?.choirs.find(row=>row.id===choirId)?.name ?? choirId;
   const ruleName = (ruleId: string) => { const rule = policies.data?.policies.find(row=>row.id===ruleId); return services.data?.services.find(row=>row.id===rule?.serviceId)?.name ?? t('door.config.nameUnavailable.service'); };
   const run = async (job: () => Promise<unknown>) => { if (busy) return; setError(''); setBusy(true); try { await job(); setup.saved(); fixed.reload(); away.reload(); } catch (reason) { setError(schedulingError(reason) ?? t('door.config.err.server')); } finally { setBusy(false); } };
@@ -27,10 +27,10 @@
   return <LoadState loading={loading} failed={failed} retry={retry}>
     {error && <p className="door-error" role="alert">{error}</p>}
     <ul className="door-notices">
-      {mode === 'fixed' ? (fixed.data?.assignments ?? []).map(row=><li className="panel door-notice" key={row.id}><div className="door-notice-main"><strong>{choirName(row.choirId)}</strong><p>{ruleName(row.categoryServicePolicyId)} · {row.serviceDate ?? t('door.config.fixed.every')} {row.serviceTime ?? ''}</p>{editable && <button className="btn ghost sm" disabled={busy} onClick={()=>void run(()=>removeMusicFixedAssignment(row.id,id))}>{t('door.groups.remove')}</button>}</div></li>) : (away.data?.availability ?? []).map(row=><li className="panel door-notice" key={row.id}><div className="door-notice-main"><strong>{choirName(row.choirId)}</strong><p>{row.serviceDate} → {row.endDate ?? row.serviceDate}{row.serviceCode && <> · {services.data?.services.find(service=>service.code.toLowerCase() === row.serviceCode?.toLowerCase())?.name ?? row.serviceCode}</>}</p>{row.reason && <p className="muted">{row.reason}</p>}{editable && <button className="btn ghost sm" disabled={busy} onClick={()=>void run(()=>removeMusicAvailability(row.id))}>{t('door.groups.remove')}</button>}</div></li>)}
+      {mode === 'fixed' ? (fixed.data?.assignments ?? []).map(row=><li className="panel door-notice" key={row.id}><div className="door-notice-main"><strong>{choirName(row.choirId)}</strong><p>{ruleName(row.categoryServicePolicyId)} · {row.serviceDate ?? t('door.config.fixed.every')} {row.serviceTime ?? ''}</p>{editable && <button className="btn ghost sm" disabled={busy} onClick={()=>void run(()=>removeMusicFixedAssignment(row.id))}>{t('door.groups.remove')}</button>}</div></li>) : (away.data?.availability ?? []).map(row=><li className="panel door-notice" key={row.id}><div className="door-notice-main"><strong>{choirName(row.choirId)}</strong><p>{row.serviceDate} → {row.endDate ?? row.serviceDate}{row.serviceCode && <> · {services.data?.services.find(service=>service.code.toLowerCase() === row.serviceCode?.toLowerCase())?.name ?? row.serviceCode}</>}</p>{row.reason && <p className="muted">{row.reason}</p>}{editable && <button className="btn ghost sm" disabled={busy} onClick={()=>void run(()=>removeMusicAvailability(row.id))}>{t('door.groups.remove')}</button>}</div></li>)}
     </ul>
     {(mode === 'fixed' ? !fixed.data?.assignments.length : !away.data?.availability.length) && <EmptyState title={t(mode === 'fixed' ? 'door.config.fixed.empty' : 'door.config.availability.empty')} />}
-    {editable && <form className="panel door-form" onSubmit={event=>{ event.preventDefault(); const data = new FormData(event.currentTarget); void run(()=>mode==='fixed' ? addMusicFixedAssignment({ configVersionId:id, choirId:String(data.get('choirId')), serviceId:String(data.get('serviceId')),serviceDate:data.get('serviceDate') || null,serviceTime:data.get('serviceTime') || null }) : addMusicAvailability({ choirId:String(data.get('choirId')), fromDate:String(data.get('fromDate')),toDate:String(data.get('toDate')), reason:String(data.get('reason')) || null })); }}>
+    {editable && <form className="panel door-form" onSubmit={event=>{ event.preventDefault(); const data = new FormData(event.currentTarget); void run(()=>mode==='fixed' ? addMusicFixedAssignment({ choirId:String(data.get('choirId')), serviceId:String(data.get('serviceId')),serviceDate:data.get('serviceDate') || null,serviceTime:data.get('serviceTime') || null }) : addMusicAvailability({ choirId:String(data.get('choirId')), fromDate:String(data.get('fromDate')),toDate:String(data.get('toDate')), reason:String(data.get('reason')) || null })); }}>
       <label>{t('door.config.link.choir')}<select name="choirId" required><option value="">{t('door.gov.meeting.choose')}</option>{(choirs.data?.choirs ?? []).filter(row=>row.active).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
       {mode === 'fixed' ? <>
         <label>{t('door.config.fixed.service')}<select name="serviceId" required><option value="">{t('door.gov.meeting.choose')}</option>{(services.data?.services ?? []).filter(row=>row.active && row.musicRequired).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
```

### `src/newdesign/MonthPlanPage.tsx (diff)`
_Generate note added; pinned line removed._

```diff
--- a/src/newdesign/MonthPlanPage.tsx
+++ b/src/newdesign/MonthPlanPage.tsx
@@ -322,6 +322,7 @@
       </LoadState>
       <SidePanel open={building} title={t('door.sch.build')} onClose={() => setBuilding(false)} onSave={() => void build()} saveLabel={busy ? t('door.music.sched.building') : t('door.music.sched.buildNow')} saving={busy}>
         <div className="pt-edit">
+          <p className="muted" role="note">{t('door.scheduling.generateNote')}</p>
           <SelectField label={t('door.music.sched.horizon')} name="g-horizon" value={horizon} onChange={(e) => { setHorizon(e.target.value as MusicHorizonKey); setStart(''); }}>
             {HORIZONS.map((h) => <option key={h} value={h}>{t(`door.music.sched.horizon.${h}` as 'door.music.sched.horizon.MONTH')}</option>)}
           </SelectField>
@@ -337,7 +338,6 @@
 function RuleContext({ value }: { value: ScheduleRuleContext }) {
   const t = useT();
   return <details className="panel pt-more"><summary>{t('door.scheduling.rules')}</summary>
-    <p className="muted">{t('door.scheduling.pinned', {version:value.configLabel ?? value.configVersionId ?? '—'})}</p>
     <p>{t('door.scheduling.manual')}</p>
     {value.validation?.reason && <p className="door-error" role="alert">{value.validation.reason}</p>}
     {value.rules?.length ? <ul className="door-list">{value.rules.filter(row=>row.active).map(row=><li key={row.id}><strong>{row.categoryName} · {row.serviceCode}</strong><p className="muted">{policySummary(row,t)}</p></li>)}</ul> : <p className="muted">{t('door.scheduling.noContext')}</p>}
```

### `src/newdesign/config.ts (diff)`
_review and versions tabs removed._

```diff
--- a/src/newdesign/config.ts
+++ b/src/newdesign/config.ts
@@ -9,8 +9,6 @@
   CategoryServicePolicyApi,
   ChoirCategoryApi,
   ChoirCategoryLinkApi,
-  ConfigStatus,
-  ConfigVersionApi,
   PlanningMode,
   ProtocolDutyPolicyApi,
   ProtocolServiceRuleApi,
@@ -42,8 +40,6 @@
   'availability',
   'protocol',
   'duty',
-  'review',
-  'versions',
 ] as const;
 export type ConfigTab = (typeof CONFIG_TABS)[number];
 
@@ -51,16 +47,17 @@
   systemId === 'sys-music'
     ? CONFIG_TABS.filter((tab) => tab !== 'protocol' && tab !== 'duty')
     : systemId === 'sys-protocol'
-      ? CONFIG_TABS.filter((tab) => tab === 'services' || tab === 'protocol' || tab === 'duty' || tab === 'versions')
-      : ['services', 'versions'];
+      ? CONFIG_TABS.filter((tab) => tab === 'services' || tab === 'protocol' || tab === 'duty')
+      : ['services'];
 
 export const configTabKey = (tab: ConfigTab): MessageKey => `door.config.tab.${tab}`;
 
-export const MUSIC_SETUP_STEPS = ['services','links','policies','review'] as const;
+/** Music setup is three tabs: Services, Choirs, Rules. There is no review or activation step. */
+export const MUSIC_SETUP_STEPS = ['services','links','policies'] as const;
 export function musicSetupStep(tab: string): number {
   if (tab === 'categories' || tab === 'links') return 1;
   if (tab === 'policies' || tab === 'fixed' || tab === 'availability') return 2;
-  return tab === 'review' ? 3 : 0;
+  return 0;
 }
 
 /** A weekday 0-6 (Sunday-first) as a translated name. */
@@ -76,7 +73,6 @@
 export const frequencyKindKey = (k: CategoryServicePolicyApi['frequencyKind']): MessageKey =>
   `door.config.frequencyKind.${k}`;
 export const planningModeKey = (m: PlanningMode): MessageKey => `door.config.planningMode.${m}`;
-export const configStatusKey = (s: ConfigStatus): MessageKey => `door.config.status.${s}`;
 export const extraDutyPolicyKey = (p: ProtocolDutyPolicyApi['extraDutyPolicy']): MessageKey =>
   `door.config.extraDuty.${p}`;
 
@@ -132,13 +128,6 @@
 export const ruleSummary = (r: ProtocolServiceRuleApi, t: TFn): string =>
   `${r.serviceCode ?? t('door.config.nameUnavailable.service')} · ${t('door.config.protocol.defaultTeamSize')}: ${r.defaultTeamSize}`;
 
-/** One line for a config version row. */
-export const versionSummary = (v: ConfigVersionApi, t: TFn): string =>
-  `${v.label} · ${t(configStatusKey(v.status))} · v${v.version}`;
-
-/** The human name of a config version status. */
-export const versionStatusName = (v: ConfigVersionApi, t: TFn): string => t(configStatusKey(v.status));
-
 /** The human name of a service kind. */
 export const serviceKindName = (k: SchedulingServiceApi['kind'], t: TFn): string => t(serviceKindKey(k));
 
```

### `src/newdesign/schedulingForms.ts (diff)`
_Reads `errors` (422) and `message` (409)._

```diff
--- a/src/newdesign/schedulingForms.ts
+++ b/src/newdesign/schedulingForms.ts
@@ -2,8 +2,10 @@
 import type { ChoirCategoryLinkApi } from '../api/frontDoorApi';
 export function schedulingError(reason: unknown): string | null {
   if (!(reason instanceof ApiError) || reason.status < 400 || reason.status >= 500) return null;
-  const body = reason.body as { error?: string; issues?: Array<string | { message?: string }> } | undefined;
-  return [body?.error, ...(body?.issues ?? []).map(row => typeof row === 'string' ? row : row.message)].filter(Boolean).join(' · ') || null;
+  const body = reason.body as { error?: string; message?: string; errors?: string[]; holder?: { name?: string | null }; issues?: Array<string | { message?: string }> } | undefined;
+  // 422 from saveConfigChange carries `errors: string[]`; 409 LOCKED / SCHEDULE_FROZEN carry `message`.
+  const parts = [body?.message ?? body?.error, ...(body?.errors ?? []), ...(body?.issues ?? []).map(row => typeof row === 'string' ? row : row.message)];
+  return parts.filter(Boolean).join(' · ') || null;
 }
 export function musicExceptions(data: FormData, previous?: ChoirCategoryLinkApi | null) {
   const eligibleOverride = { ...previous?.eligibleOverride };
```

### `src/newdesign/SchedulingSetupContext.ts (diff)`
_Comment only._

```diff
--- a/src/newdesign/SchedulingSetupContext.ts
+++ b/src/newdesign/SchedulingSetupContext.ts
@@ -1,3 +1,4 @@
 import { createContext } from 'react';
 
+/** `saved` clears the page's dirty flag after a successful save; `changed` sets it. Saves are live, so there is no draft state here. */
 export const SchedulingSetupContext = createContext({ saved: () => {}, changed: () => {} });
```

### `src/api/frontDoorApi.ts (diff)`
_Version API removed; lock and validation calls added._

```diff
--- a/src/api/frontDoorApi.ts
+++ b/src/api/frontDoorApi.ts
@@ -1669,7 +1669,7 @@
   options: Record<string, Array<{ value: string; label: string }>>;
   units: Array<{ id: string; name: string; kind: ChoirRole }>;
 };
-export type ScheduleRuleContext = { configVersionId?: string | null; configLabel?: string | null; rules?: Array<CategoryServicePolicyApi & { categoryName: string; serviceCode: string }>; validation?: { ok: boolean; reason?: string; warnings: string[] } | null };
+export type ScheduleRuleContext = { rules?: Array<CategoryServicePolicyApi & { categoryName: string; serviceCode: string }>; validation?: { ok: boolean; reason?: string; warnings: string[] } | null };
 export type ScheduleDraftView = ScheduleRuleContext & { id: string; label: string; horizon: MusicHorizonKey; warnings: string[]; months: Array<{ periodKey: string; decided: 'CONFIRMED' | 'PUBLISHED' | null }>; services: ScheduleService[] };
 export type ScheduleMonthView = ScheduleRuleContext & { canWrite: boolean; periodKey: string; state: 'CONFIRMED' | 'PUBLISHED'; version: number; warnings: string[]; services: ScheduleService[] };
 export type ScheduleEdit = { serviceId: string; action: 'add' | 'remove' | 'replace'; unitId: string; toUnitId?: string | null };
@@ -2107,50 +2107,38 @@
 export type SchedulingServiceApi = {
   id: string; systemId: string; code: string; name: string; kind: ServiceKind;
   weekday: number | null; time: string | null; recurrence: Recurrence; selectedDates: string[];
-  active: boolean; effectiveFrom: string; effectiveTo: string | null;
+  active: boolean;
   musicRequired: boolean; protocolRequired: boolean; maxChoirs: number; targetTeamSize: number;
-  configVersionId: string | null; displayOrder: number; supersedesId: string | null;
+  displayOrder: number;
   createdByPersonId: string; createdAt: string;
 };
 export type ChoirCategoryApi = {
   id: string; systemId: string; code: string; name: string; description: string; active: boolean;
-  effectiveFrom: string; effectiveTo: string | null; configVersionId: string | null;
-  supersedesId: string | null; createdByPersonId: string; createdAt: string;
+  createdByPersonId: string; createdAt: string;
 };
 export type CategoryServicePolicyApi = {
   id: string; systemId: string; categoryId: string; serviceId: string; eligible: boolean; active: boolean;
   frequencyTarget: number | null; frequencyCounting: FrequencyCounting; frequencyKind: FrequencyKind;
   frequencyPeriod?: 'MONTH' | 'QUARTER' | 'HALF_YEAR' | 'YEAR' | null; planningMode: PlanningMode; minCount: number | null; maxCount: number | null; requireAll: boolean;
-  configVersionId: string | null; effectiveFrom: string; effectiveTo: string | null;
-  supersedesId: string | null; createdByPersonId: string; createdAt: string;
+  createdByPersonId: string; createdAt: string;
 };
 export type ChoirCategoryLinkApi = {
   id: string; systemId: string; choirId: string; categoryId: string;
   eligibleOverride: Record<string, unknown>; frequencyOverride: Record<string, unknown>; active: boolean;
-  effectiveFrom: string; effectiveTo: string | null; configVersionId: string | null;
-  supersedesId: string | null; createdByPersonId: string; createdAt: string;
+  createdByPersonId: string; createdAt: string;
 };
 export type ProtocolServiceRuleApi = {
   id: string; systemId: string; serviceId: string; serviceCode?: string; active: boolean; required: boolean;
   defaultTeamSize: number; teamSizeOverrides: Record<string, number>; requireChoir: boolean;
-  requireWorship: boolean; relaxableKinds: string[]; configVersionId: string | null;
-  effectiveFrom: string; effectiveTo: string | null; supersedesId: string | null;
+  requireWorship: boolean; relaxableKinds: string[];
   createdByPersonId: string; createdAt: string;
 };
 export type ProtocolDutyPolicyApi = {
   id: string; systemId: string; preferTarget: number; softMax: number; hardMax: number;
   extraDutyPolicy: 'ALLOW_WHEN_SHORT' | 'NEVER' | 'ALWAYS'; duplicateSameDayAllowed: boolean;
   musicCompatibilityRequired: boolean; leadershipPriorities: string[]; exceptionsAllowed: boolean;
-  configVersionId: string | null; effectiveFrom: string; effectiveTo: string | null;
-  supersedesId: string | null; createdByPersonId: string; createdAt: string;
-};
-export type ConfigVersionApi = {
-  id: string; systemId: string; version: number; label: string; status: ConfigStatus;
-  effectiveFrom: string; effectiveTo: string | null; createdByPersonId: string; createdAt: string;
-  reason: string | null; previousVersionId: string | null; notes: Record<string, unknown>;
-  validation: Record<string, unknown>; affectedSchedules: string[];
+  createdByPersonId: string; createdAt: string;
 };
-export type ConfigStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'SCHEDULED' | 'ARCHIVED';
 export type ServiceKind = 'SERVICE' | 'REHEARSAL' | 'MEETING' | 'OTHER';
 export type Recurrence = 'WEEKLY' | 'MONTHLY' | 'SELECTED_DATES' | 'CUSTOM';
 export type FrequencyCounting = 'ASSIGNMENTS' | 'DISTINCT_DATES';
@@ -2164,53 +2152,50 @@
 };
 const scPost = (path: string, body: object) => apiFetch(`${SC}${path}`, { method: 'POST', body });
 
-export const fetchConfigVersions = (systemId: string): Promise<{ versions: ConfigVersionApi[] }> => scGet('/versions', systemId);
-export const fetchSchedulingServices = (systemId: string, activeOnly = false, configVersionId?: string): Promise<{ services: SchedulingServiceApi[] }> =>
-  scGet('/services', systemId, { ...(activeOnly ? { active: 'true' } : {}), ...(configVersionId ? { configVersionId } : {}) });
-export const fetchChoirCategories = (systemId: string, activeOnly = false, configVersionId?: string): Promise<{ categories: ChoirCategoryApi[] }> =>
-  scGet('/categories', systemId, { ...(activeOnly ? { active: 'true' } : {}), ...(configVersionId ? { configVersionId } : {}) });
-export const fetchCategoryServicePolicies = (systemId: string, configVersionId?: string): Promise<{ policies: CategoryServicePolicyApi[] }> =>
-  scGet('/policies', systemId, configVersionId ? { configVersionId } : {});
-export const fetchChoirCategoryLinks = (systemId: string, configVersionId?: string): Promise<{ links: ChoirCategoryLinkApi[] }> =>
-  scGet('/links', systemId, configVersionId ? { configVersionId } : {});
-export const fetchProtocolServiceRules = (systemId: string, configVersionId?: string): Promise<{ rules: ProtocolServiceRuleApi[] }> =>
-  scGet('/protocol/rules', systemId, configVersionId ? { configVersionId } : {});
-export const fetchProtocolDutyPolicy = (systemId: string, configVersionId?: string): Promise<{ policy: ProtocolDutyPolicyApi | null }> =>
-  scGet('/protocol/policy', systemId, configVersionId ? { configVersionId } : {});
-
-export const createConfigVersion = (body: object) => scPost('/versions', body);
-export const cloneConfigVersion = (systemId: string, label: string, reason?: string) =>
-  scPost('/versions/clone', { systemId, label, reason });
-export const activateConfigVersion = (id: string) =>
-  apiFetch(`${SC}/versions/${encodeURIComponent(id)}/activate`, { method: 'POST', body: {} });
-export const archiveConfigVersion = (id: string) => apiFetch(SC + '/versions/' + encodeURIComponent(id) + '/archive', { method: 'POST', body: {} });
-export const restoreConfigVersion = (id: string) => apiFetch(SC + '/versions/' + encodeURIComponent(id) + '/restore', { method: 'POST', body: {} });
-export const deleteConfigVersion = (id: string) => apiFetch(SC + '/versions/' + encodeURIComponent(id), { method: 'DELETE' });
+/** Configuration is live: there are no versions to choose, so every read returns the one current set. */
+export const fetchSchedulingServices = (systemId: string, activeOnly = false): Promise<{ services: SchedulingServiceApi[] }> =>
+  scGet('/services', systemId, activeOnly ? { active: 'true' } : {});
+export const fetchChoirCategories = (systemId: string, activeOnly = false): Promise<{ categories: ChoirCategoryApi[] }> =>
+  scGet('/categories', systemId, activeOnly ? { active: 'true' } : {});
+export const fetchCategoryServicePolicies = (systemId: string): Promise<{ policies: CategoryServicePolicyApi[] }> => scGet('/policies', systemId);
+export const fetchChoirCategoryLinks = (systemId: string): Promise<{ links: ChoirCategoryLinkApi[] }> => scGet('/links', systemId);
+export const fetchProtocolServiceRules = (systemId: string): Promise<{ rules: ProtocolServiceRuleApi[] }> => scGet('/protocol/rules', systemId);
+export const fetchProtocolDutyPolicy = (systemId: string): Promise<{ policy: ProtocolDutyPolicyApi | null }> => scGet('/protocol/policy', systemId);
+/** Can the live configuration generate a schedule right now? */
+export const fetchConfigValidation = (systemId: string): Promise<{ ok: boolean; errors: string[] }> => scGet('/validation', systemId);
+
 export const createSchedulingService = (body: object) => scPost('/services', body);
 export const createChoirCategory = (body: object) => scPost('/categories', body);
 export const createCategoryServicePolicy = (body: object) => scPost('/policies', body);
 export const createChoirCategoryLink = (body: object) => scPost('/links', body);
 export const createProtocolServiceRule = (body: object) => scPost('/protocol/rules', body);
 export const createProtocolDutyPolicy = (body: object) => scPost('/protocol/policy', body);
-export const updateSchedulingService = (id: string, configVersionId: string, patch: object) =>
-  apiFetch(`${SC}/services/${encodeURIComponent(id)}`, { method: 'PATCH', body: { configVersionId, patch } });
-export const updateChoirCategory = (id: string, configVersionId: string, patch: object) =>
-  apiFetch(`${SC}/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: { configVersionId, patch } });
-export const updateCategoryServicePolicy = (id: string, configVersionId: string, patch: object) =>
-  apiFetch(`${SC}/policies/${encodeURIComponent(id)}`, { method: 'PATCH', body: { configVersionId, patch } });
-export const updateChoirCategoryLink = (id: string, configVersionId: string, patch: object) =>
-  apiFetch(`${SC}/links/${encodeURIComponent(id)}`, { method: 'PATCH', body: { configVersionId, patch } });
-export const updateProtocolServiceRule = (id: string, configVersionId: string, patch: object) =>
-  apiFetch(`${SC}/protocol/rules/${encodeURIComponent(id)}`, { method: 'PATCH', body: { configVersionId, patch } });
-export const updateProtocolDutyPolicy = (id: string, configVersionId: string, patch: object) =>
-  apiFetch(`${SC}/protocol/policy/${encodeURIComponent(id)}`, { method: 'PATCH', body: { configVersionId, patch } });
+export const updateSchedulingService = (id: string, patch: object) =>
+  apiFetch(`${SC}/services/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
+export const updateChoirCategory = (id: string, patch: object) =>
+  apiFetch(`${SC}/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
+export const updateCategoryServicePolicy = (id: string, patch: object) =>
+  apiFetch(`${SC}/policies/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
+export const updateChoirCategoryLink = (id: string, patch: object) =>
+  apiFetch(`${SC}/links/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
+export const updateProtocolServiceRule = (id: string, patch: object) =>
+  apiFetch(`${SC}/protocol/rules/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
+export const updateProtocolDutyPolicy = (id: string, patch: object) =>
+  apiFetch(`${SC}/protocol/policy/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
 export const retireSchedulingService = (id: string) => apiFetch(`${SC}/services/${encodeURIComponent(id)}/retire`, { method: 'POST', body: {} });
 
-export type MusicFixedAssignmentApi = { id: string; choirId: string; categoryServicePolicyId: string; configVersionId: string; serviceDate?:string|null; serviceTime?:string|null };
+/** The person holding a system's configuration edit lock. */
+export type ConfigLockHolder = { personId: string; name: string | null; since: string; expiresAt: string };
+/** Take the edit lock. Rejects with ApiError 409 and body.holder when someone else is editing. */
+export const acquireConfigLock = (systemId: string) => apiFetch<{ ok: true; lock: { expiresAt: string } }>(`${SC}/lock?${new URLSearchParams({ systemId })}`, { method: 'POST', body: { systemId } });
+export const refreshConfigLock = (systemId: string) => apiFetch<{ ok: true }>(`${SC}/lock/refresh?${new URLSearchParams({ systemId })}`, { method: 'POST', body: { systemId } });
+export const releaseConfigLock = (systemId: string) => apiFetch<{ ok: true }>(`${SC}/lock?${new URLSearchParams({ systemId })}`, { method: 'DELETE' });
+
+export type MusicFixedAssignmentApi = { id: string; choirId: string; categoryServicePolicyId: string; serviceDate?:string|null; serviceTime?:string|null };
 export type MusicAvailabilityApi = { id: string; choirId: string; serviceDate: string; endDate?:string|null; serviceCode: string | null; reason: string | null };
-export const fetchMusicFixedAssignments = (versionId: string) => scGet<{ assignments: MusicFixedAssignmentApi[] }>('/fixed-assignments', 'sys-music', { configVersionId: versionId });
+export const fetchMusicFixedAssignments = () => scGet<{ assignments: MusicFixedAssignmentApi[] }>('/fixed-assignments', 'sys-music');
 export const addMusicFixedAssignment = (body: object) => scPost('/fixed-assignments', { ...body, systemId: 'sys-music' });
-export const removeMusicFixedAssignment = (id: string, configVersionId: string) => apiFetch(SC + '/fixed-assignments/' + encodeURIComponent(id), { method: 'DELETE', body: { configVersionId } });
+export const removeMusicFixedAssignment = (id: string) => apiFetch(SC + '/fixed-assignments/' + encodeURIComponent(id), { method: 'DELETE' });
 export const fetchMusicAvailability = (date = '') => scGet<{ availability: MusicAvailabilityApi[] }>('/availability', 'sys-music', date ? { serviceDate: date } : {});
 export const addMusicAvailability = (body: object) => scPost('/availability', { ...body, systemId: 'sys-music' });
 export const removeMusicAvailability = (id: string) => apiFetch(SC + '/availability/' + encodeURIComponent(id), { method: 'DELETE' });
```

**Deleted:** `src/newdesign/MusicSetupReview.tsx` (and the Review wizard branch).

## 9. i18n

Removed (42 keys, also in `removed-i18n-keys.txt`):

```
door.config.intro.music.versions
door.config.intro.protocol.versions
door.config.tab.versions
door.config.version.heading
door.config.version.chooseHelp
door.config.version.activateTitle
door.config.version.activateBody
door.config.versions.empty
door.config.service.missingInDraft
door.config.version.label
door.config.version.number
door.config.version.status
door.config.version.effective
door.config.version.reason
door.config.version.createDraft
door.config.version.draftLabel
door.config.version.allDrafts
door.config.version.activate
door.config.selectedVersion
door.config.draftEditable
door.config.activeInUse
door.config.activeVersion
door.config.versionReadOnly
door.config.version.select
door.config.version.selected
door.config.step.review
door.config.tab.review
door.config.setup.question.review
door.config.setup.edit
door.config.archivedReadOnly
door.config.status.ARCHIVED
door.config.version.archive
door.config.version.restore
door.config.version.delete
door.config.version.archiveBody
door.config.version.restoreBody
door.config.version.deleteBody
door.config.status.DRAFT
door.config.status.ACTIVE
door.config.status.SUPERSEDED
door.config.status.SCHEDULED
door.scheduling.pinned
```

Reworded (draft/version language dropped): `door.config.saved`, `emptyDraft`, `empty`, `registerSync`, `needsCategory`, `registerMissing`, `intro.music.fixed`, `intro.music.availability`, `fixed.empty`, `setup.progress` (now "of 3"), `door.scheduling.noContext`.

Added: `door.config.live`, `readOnly`, `lock.heldBy`, `lock.someone`, `lock.mine`, `lock.lost`, `leave.title`, `leave.confirm`, `validation.heading`, and `door.scheduling.generateNote` ("Configuration is applied at generate time. Confirmed and published schedules are frozen and will not be rebuilt.").

I only had `en.ts`. Any other locale file needs the same removals. `door.protocol.stale.*` is kept: it covers Music schedule content changes, not config versions.

---

## What broke and why it's OK

- **Reproducibility.** A schedule's content lives in its own frozen row, so reading it never needed the config. The generate guard (409 `SCHEDULE_FROZEN`) stops a confirmed or published schedule from being rebuilt under newer config. Only DRAFT schedules regenerate, and they use the config as it is at that moment. The old pin could answer "which config built this?"; the audit log now answers "what changed, when, by whom".
- **Protocol "Music changed since plan was built" (config version path).** Removed by design: there is no Music config version to compare. The check on Music *schedule content* changing after teams were built (`MUSIC_CHANGED`) is kept. New plans have null pins, so the unpinned/changed checks on submit, publish and acknowledge-music were removed too, or new plans could never be published.
- **Draft schedules and live validation.** A draft schedule opened after a config edit is validated against the config as it is now. Editing a draft, confirming it, or editing a confirmed or published month can therefore start failing if someone changed config in between. This is the expected cost of live config. Confirmed and published months are not rebuilt.
- **Concurrency.** One server lock per system, 15-minute expiry, refreshed by saves and a 60s heartbeat. The holder is a person, not a tab: two tabs share one lock and the first to close releases it for both. The expiry is the backstop. `saveConfigChange` refuses writes without a live lock, so a stale tab gets 409 `LOCKED` rather than overwriting.
- **Incremental saves.** Validation gates every save, but a config can be invalid mid-setup. Rule: a save is rejected only if it introduces errors that were not already present. Implied default policies are added in the same transaction when a category or service is created or reactivated.
- **Tests that will break.** `fakePrisma` (no `configVersion`, now needs `configEditLock`), `src/api/schedulingConfigApi.test.ts` (version calls), any test using the old store version functions or `loadMusicConfig(versionId)`, and anything asserting `configVersionId` on schedule responses. I did not touch tests I could not run.
- **Old clients.** A client still sending `configVersionId` is ignored. Schedule responses no longer include `configVersionId` or `configLabel`.

## Migration risk

- **Discarded work:** `DROP TABLE "ConfigVersion" CASCADE` discards in-flight DRAFT versions and their rows.
- **Kept version:** per system the ACTIVE version survives. All rows of other versions are deleted. Take a database snapshot first.
- **No ACTIVE version:** falls back to the highest version number. `TODO(confirm)`.
- **Protocol rules:** `ProtocolServiceRule.serviceId` is remapped by service code onto the surviving Music service before old services are deleted. A rule whose code has no match is deleted with its version.
- **Unique indexes:** the new unique indexes fail loudly if duplicates remain after the collapse. The migration aborts and rolls back. Fix the data and rerun.
- **Orphaned pin columns:** `MusicMonth.configVersionId`, ProtocolPlan's pinned Music version and similar columns keep their old values, with no FK. They are marked `// TODO(drop): after backfill`. A follow-up migration drops them.
- **Rollout order:** deploy server and migration together. A cached old front end still works for reads; its version calls get 404 and its writes lack the lock.
- **Rollback:** only from the snapshot. The migration is not reversible.

## `TODO(confirm)` items

1. No-ACTIVE fallback (highest version).
2. "No new errors" rule for incremental saves.
3. Protocol frozen when plan is REVIEW as well as PUBLISHED.
4. Keeping all historical pin columns.
5. Choir-register sync scope (adds missing links only).
6. Save is not gated on live `validation.ok`. Gating on the live state would block the very edit that fixes it. The server 422 is the gate.
7. Extra `unique(systemId, code)` indexes beyond the spec.
8. `useBlocker` is mounted only under a data router; under `<BrowserRouter>` only `beforeunload` protects. Check how the app mounts its router.

## Commit

```
Make scheduling configuration live; remove config versioning

Config edits apply on save and are read by the next generate call. Drop
ConfigVersion and the version/effective/supersedes columns. Add
ConfigEditLock (one editor per system, 15 min expiry), a single
saveConfigChange write path gated by generation validation, and
SCHEDULE_FROZEN guards on generate. Audit log preserved.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HGLZ7aNirSyXCKsYqHJn7N
```

Run `git add -A; git commit; git push` from your PC. Delete `src/newdesign/MusicSetupReview.tsx` there, and still delete `src/newdesign/PeopleFilterPanel.tsx`. Advanced Filtering Phase 2 still waits for your approval of the four visual states.
