-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "preferredName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "dateOfBirth" TEXT,
    "gender" TEXT,
    "address" TEXT,
    "nationalId" TEXT,
    "joinedChurchOn" TEXT,
    "pastoralNotes" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchSystem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT NOT NULL DEFAULT '',
    "basePath" TEXT NOT NULL,
    "externalUrl" TEXT,
    "orgUnitId" TEXT,

    CONSTRAINT "ChurchSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "description" TEXT,
    "systemId" TEXT,
    "leaderPersonId" TEXT,

    CONSTRAINT "OrgUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "systemId" TEXT,
    "orgUnitId" TEXT,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "systemId" TEXT,
    "orgUnitId" TEXT,
    "title" TEXT NOT NULL,
    "systemRole" TEXT,
    "ministryOffice" TEXT,
    "choirOffice" TEXT,
    "choirAdvisorRole" TEXT,
    "systemAdmin" BOOLEAN NOT NULL DEFAULT false,
    "worshipOffice" TEXT,
    "protocolOffice" TEXT,
    "deaconOffice" TEXT,
    "grantsAllSystems" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "ownerSystemId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundAccessGrant" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "grantedByPersonId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),

    CONSTRAINT "FundAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTxn" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "postedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceTxn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "systemId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "detail" TEXT,
    "metaJson" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoHandoffToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoHandoffToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "orgUnitId" TEXT,
    "ownerSystemId" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'MINISTRY',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "programType" TEXT,
    "scheduleHint" TEXT,
    "parentProgramId" TEXT,
    "cohortLabel" TEXT,
    "createdByPersonId" TEXT,
    "approvedByPersonId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "stewardshipJson" TEXT,
    "stewardshipVersion" INTEGER NOT NULL DEFAULT 1,
    "metaJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramActivity" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "sessionClosedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramEnrollment" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "roleKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "enrolledOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedOn" TIMESTAMP(3),
    "completedOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityAttendance" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "orgUnitId" TEXT,
    "ownerSystemId" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'MINISTRY',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "registrationMode" TEXT,
    "capacity" INTEGER,
    "beyondOwnerScope" BOOLEAN NOT NULL DEFAULT false,
    "createdByPersonId" TEXT,
    "programId" TEXT,
    "projectId" TEXT,
    "collaboratorSystemIds" TEXT,
    "collaboratorPersonIds" TEXT,
    "lifecyclePhase" TEXT DEFAULT 'PREPARE',
    "approvalsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "registeredOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionShare" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'VIEW',
    "grantedByPersonId" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerPersonId" TEXT NOT NULL,
    "helperPersonIds" TEXT,
    "createdByPersonId" TEXT,
    "contextType" TEXT NOT NULL DEFAULT 'GENERAL',
    "contextId" TEXT,
    "contextLabel" TEXT,
    "systemId" TEXT,
    "grantsSystemAccess" BOOLEAN NOT NULL DEFAULT false,
    "accessRevokedAt" TIMESTAMP(3),
    "visibility" TEXT NOT NULL DEFAULT 'MINISTRY',
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "dueDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "outcomeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchProject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "ownerSystemId" TEXT NOT NULL,
    "orgUnitId" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'MINISTRY',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "programId" TEXT,
    "fundId" TEXT,
    "willSpend" BOOLEAN NOT NULL DEFAULT false,
    "beyondOwnerScope" BOOLEAN NOT NULL DEFAULT false,
    "createdByPersonId" TEXT,
    "leadPersonId" TEXT,
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "stewardshipJson" TEXT,
    "stewardshipVersion" INTEGER NOT NULL DEFAULT 1,
    "approvalsJson" TEXT,
    "collaboratorSystemIds" TEXT,
    "collaboratorPersonIds" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contextType" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "contextLabel" TEXT NOT NULL,
    "orgUnitId" TEXT,
    "systemId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionClaim" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "orgUnitId" TEXT,
    "personId" TEXT NOT NULL,
    "typeLabel" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "confirmedAmount" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByPersonId" TEXT,
    "verifyNote" TEXT,
    "financeTxnId" TEXT,

    CONSTRAINT "ContributionClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleDocument" (
    "key" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByPersonId" TEXT,

    CONSTRAINT "ScheduleDocument_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ScheduleDocumentRevision" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "savedByPersonId" TEXT,

    CONSTRAINT "ScheduleDocumentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_personId_key" ON "Account"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchSystem_code_key" ON "ChurchSystem"("code");

-- CreateIndex
CREATE INDEX "Membership_personId_systemId_idx" ON "Membership"("personId", "systemId");

-- CreateIndex
CREATE INDEX "Position_personId_systemId_idx" ON "Position"("personId", "systemId");

-- CreateIndex
CREATE UNIQUE INDEX "Fund_code_key" ON "Fund"("code");

-- CreateIndex
CREATE INDEX "FundAccessGrant_personId_fundId_idx" ON "FundAccessGrant"("personId", "fundId");

-- CreateIndex
CREATE INDEX "FinanceTxn_fundId_occurredOn_idx" ON "FinanceTxn"("fundId", "occurredOn");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- CreateIndex
CREATE UNIQUE INDEX "SsoHandoffToken_token_key" ON "SsoHandoffToken"("token");

-- CreateIndex
CREATE INDEX "SsoHandoffToken_token_idx" ON "SsoHandoffToken"("token");

-- CreateIndex
CREATE INDEX "Program_ownerSystemId_status_idx" ON "Program"("ownerSystemId", "status");

-- CreateIndex
CREATE INDEX "ProgramActivity_programId_startsAt_idx" ON "ProgramActivity"("programId", "startsAt");

-- CreateIndex
CREATE INDEX "ProgramEnrollment_personId_status_idx" ON "ProgramEnrollment"("personId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramEnrollment_programId_personId_key" ON "ProgramEnrollment"("programId", "personId");

-- CreateIndex
CREATE INDEX "ActivityAttendance_personId_idx" ON "ActivityAttendance"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityAttendance_activityId_personId_key" ON "ActivityAttendance"("activityId", "personId");

-- CreateIndex
CREATE INDEX "ChurchEvent_ownerSystemId_startsAt_idx" ON "ChurchEvent"("ownerSystemId", "startsAt");

-- CreateIndex
CREATE INDEX "ChurchEvent_projectId_idx" ON "ChurchEvent"("projectId");

-- CreateIndex
CREATE INDEX "EventRegistration_personId_status_idx" ON "EventRegistration"("personId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_personId_key" ON "EventRegistration"("eventId", "personId");

-- CreateIndex
CREATE INDEX "MissionShare_kind_resourceId_status_idx" ON "MissionShare"("kind", "resourceId", "status");

-- CreateIndex
CREATE INDEX "MissionShare_personId_status_idx" ON "MissionShare"("personId", "status");

-- CreateIndex
CREATE INDEX "WorkTask_ownerPersonId_status_idx" ON "WorkTask"("ownerPersonId", "status");

-- CreateIndex
CREATE INDEX "WorkTask_systemId_status_idx" ON "WorkTask"("systemId", "status");

-- CreateIndex
CREATE INDEX "ChurchProject_ownerSystemId_status_idx" ON "ChurchProject"("ownerSystemId", "status");

-- CreateIndex
CREATE INDEX "ChurchProject_programId_idx" ON "ChurchProject"("programId");

-- CreateIndex
CREATE INDEX "Assignment_personId_status_idx" ON "Assignment"("personId", "status");

-- CreateIndex
CREATE INDEX "Assignment_systemId_status_idx" ON "Assignment"("systemId", "status");

-- CreateIndex
CREATE INDEX "ContributionClaim_systemId_status_idx" ON "ContributionClaim"("systemId", "status");

-- CreateIndex
CREATE INDEX "ContributionClaim_personId_submittedAt_idx" ON "ContributionClaim"("personId", "submittedAt");

-- CreateIndex
CREATE INDEX "ContributionClaim_fundId_idx" ON "ContributionClaim"("fundId");

-- CreateIndex
CREATE INDEX "ContributionClaim_orgUnitId_idx" ON "ContributionClaim"("orgUnitId");

-- CreateIndex
CREATE INDEX "ScheduleDocumentRevision_key_version_idx" ON "ScheduleDocumentRevision"("key", "version");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchSystem" ADD CONSTRAINT "ChurchSystem_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "ChurchSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "ChurchSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_ownerSystemId_fkey" FOREIGN KEY ("ownerSystemId") REFERENCES "ChurchSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundAccessGrant" ADD CONSTRAINT "FundAccessGrant_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundAccessGrant" ADD CONSTRAINT "FundAccessGrant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundAccessGrant" ADD CONSTRAINT "FundAccessGrant_grantedByPersonId_fkey" FOREIGN KEY ("grantedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTxn" ADD CONSTRAINT "FinanceTxn_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramActivity" ADD CONSTRAINT "ProgramActivity_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityAttendance" ADD CONSTRAINT "ActivityAttendance_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ProgramActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ChurchEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

