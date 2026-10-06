/** Canonical human identity — one Person across every system. */
export interface Person {
  id: string;
  fullName: string;
  preferredName?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE';
  address?: string;
  nationalId?: string;
  /** Date joined this local church. */
  joinedChurchOn?: string;
  pastoralNotes?: string;
  /** Small profile picture as a data URL (see lib/photo). */
  photoUrl?: string;
  /** @deprecated Full-quality copies now live in IndexedDB (lib/photoStore). */
  photoSource?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'VISITOR';
  createdAt: string;
}

/** Household / kinship links (Main Church pastoral record — not Choir "families"). */
export type FamilyRelation =
  | 'SPOUSE'
  | 'CHILD'
  | 'PARENT'
  | 'SIBLING'
  | 'GUARDIAN'
  | 'OTHER';

export interface PersonFamilyLink {
  id: string;
  personId: string;
  relatedPersonId: string;
  relation: FamilyRelation;
  notes?: string;
}

export interface PersonBaptismRecord {
  personId: string;
  baptizedOn: string;
  place?: string;
  mode?: 'IMMERSION' | 'POURING' | 'OTHER';
  ministerName?: string;
  certificateRef?: string;
  notes?: string;
}

export interface PersonMarriageRecord {
  personId: string;
  spousePersonId?: string;
  spouseName?: string;
  marriedOn: string;
  place?: string;
  status: 'MARRIED' | 'WIDOWED' | 'DIVORCED' | 'SEPARATED';
  certificateRef?: string;
  notes?: string;
}

export interface PersonTimelineEvent {
  id: string;
  personId: string;
  at: string;
  kind:
    | 'MEMBERSHIP'
    | 'BAPTISM'
    | 'MARRIAGE'
    | 'MINISTRY'
    | 'DISCIPLINE'
    | 'NOTE'
    | 'OTHER';
  title: string;
  detail?: string;
}

export interface PersonDocumentMeta {
  id: string;
  personId: string;
  label: string;
  kind: 'CERTIFICATE' | 'ID' | 'LETTER' | 'OTHER';
  issuedOn?: string;
  note?: string;
  /** Uploaded file (prototype — stored as data URL in memory). */
  fileName?: string;
  fileMime?: string;
  fileDataUrl?: string;
}

/** Work / livelihood on the pastoral 360 record. */
export interface PersonEmploymentRecord {
  id: string;
  personId: string;
  employer: string;
  title?: string;
  sector?: string;
  status: 'CURRENT' | 'FORMER';
  startedOn?: string;
  endedOn?: string;
  notes?: string;
}

/** Schooling / training on the pastoral 360 record. */
export interface PersonEducationRecord {
  id: string;
  personId: string;
  institution: string;
  level?: string;
  field?: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'INCOMPLETE';
  startedOn?: string;
  endedOn?: string;
  notes?: string;
}

/** Natural talent or learned skill. */
export interface PersonTalentSkill {
  id: string;
  personId: string;
  kind: 'TALENT' | 'SKILL';
  name: string;
  proficiency?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  notes?: string;
}

/** Spiritual gift noted for ministry placement. */
export interface PersonSpiritualGift {
  id: string;
  personId: string;
  gift: string;
  evidence?: string;
  notes?: string;
}

/**
 * Login credentials ↔ exactly one Person (SSO across systems).
 * System access is derived from participation — not stored on the account.
 */
export interface UserAccount {
  id: string;
  personId: string;
  username: string;
  /** Demo-only plaintext; replace with hashed credentials in production. */
  password: string;
}

export type SystemRole =
  | 'CHURCH_LEADER'
  | 'PASTOR'
  | 'CATECHIST'
  | 'CHURCH_SECRETARY'
  | 'CHURCH_TREASURER'
  /** Everyone else in the main system: visitor, attendee, official member, ministry officer… */
  | 'MEMBER';

/** Stage-1 coarse scopes; Phase 2 will be per-system + resource. */
export type AccessScope = 'FULL' | 'FINANCE' | 'MEMBER';

export type SystemId =
  | 'sys-main'
  | 'sys-choir'
  | 'sys-worship'
  | 'sys-music'
  | 'sys-youth'
  | 'sys-protocol'
  | 'sys-deacon'
  | 'sys-media'
  | 'sys-men'
  | 'sys-women'
  | 'sys-couples'
  | 'sys-children'
  | 'sys-elderly'
  | 'sys-evangelism'
  | 'sys-intercessors'
  | 'sys-finance';

export type SystemCode =
  | 'MAIN_CHURCH'
  | 'CHOIR'
  | 'WORSHIP'
  | 'MUSIC'
  | 'YOUTH'
  | 'PROTOCOL'
  | 'DEACON'
  | 'MEDIA'
  | 'MEN'
  | 'WOMEN'
  | 'COUPLES'
  | 'CHILDREN'
  | 'ELDERLY'
  | 'EVANGELISM'
  | 'INTERCESSORS'
  | 'FINANCE';

export type SystemKind = 'MAIN' | 'MINISTRY' | 'OFFICE' | 'SHARED';

export type SystemStatus = 'ACTIVE' | 'PLANNED';

/**
 * Deployable peer application in the ecosystem.
 * Ministries are Systems — not nav modules inside Main Church.
 */
export interface ChurchSystem {
  id: SystemId;
  code: SystemCode;
  name: string;
  shortName: string;
  kind: SystemKind;
  status: SystemStatus;
  description: string;
  /** In-app path for this prototype (same origin). */
  basePath: string;
  /**
   * Future separate deploy URL, e.g. https://choir.adepr-kacyiru.rw
   * When set, SSO handoff redirects here instead of in-app navigation.
   */
  externalUrl?: string;
  /** OrgUnit that owns / maps to this system (ministry ↔ system). */
  orgUnitId?: string;
}

export type OrgUnitType =
  | 'MINISTRY'
  | 'TEAM'
  | 'ORGANISATION'
  | 'OFFICE'
  | 'COMMITTEE';

export interface OrgUnit {
  id: string;
  name: string;
  type: OrgUnitType;
  parentId?: string;
  description?: string;
  /** When set, this unit has (or will have) its own peer System. */
  systemId?: SystemId;
  leaderPersonId?: string;
}

/** Standing belonging — Membership ≠ Position ≠ Assignment. */
export type MembershipType =
  | 'CHURCH_MEMBER'
  | 'CHOIR_MEMBER'
  | 'WORSHIP_MEMBER'
  | 'YOUTH_MEMBER'
  | 'PROTOCOL_MEMBER'
  | 'DEACON_MEMBER'
  | 'MEDIA_MEMBER'
  | 'MUSIC_MEMBER'
  | 'MEN_MEMBER'
  | 'WOMEN_MEMBER'
  | 'COUPLES_MEMBER'
  | 'CHILDREN_MEMBER'
  | 'ELDERLY_MEMBER'
  | 'EVANGELISM_MEMBER'
  | 'INTERCESSORS_MEMBER';

export type ParticipationStatus = 'ACTIVE' | 'ENDED' | 'SUSPENDED';

export interface Membership {
  id: string;
  personId: string;
  type: MembershipType;
  label: string;
  orgUnitId?: string;
  /** When set, active membership entitles entry to this system. */
  systemId?: SystemId;
  status: ParticipationStatus;
  startDate: string;
  endDate?: string;
}

/** Standing authority in an OrgUnit (leader, treasurer, secretary…). */
export interface Position {
  id: string;
  personId: string;
  title: string;
  orgUnitId: string;
  /** Maps to Stage-1 SystemRole for profile scope. */
  systemRole?: SystemRole;
  /**
   * Protocol office when this position is on the Protocol Team.
   * Drives Protocol-specific grants (Coordinator vs Treasurer vs Member…).
   */
  protocolOffice?: ProtocolOffice;
  /**
   * Choir CMS office when this position is on a named choir.
   * Drives Choir finance / leadership grants.
   */
  choirOffice?: ChoirOffice;
  /**
   * When choirOffice is ADVISOR — custom brief, e.g. "Spiritual leader".
   */
  choirAdvisorRole?: string;
  /**
   * Worship CMS office when this position is on the Worship team.
   * Drives Worship finance / leadership grants.
   */
  worshipOffice?: WorshipOffice;
  /**
   * Deacon team office when this position is on the Deacon team.
   */
  deaconOffice?: DeaconOffice;
  /**
   * Standing ministry board office (President / VP / Secretary / Treasurer).
   * Drives mission CRUD + publish rights across peer systems.
   */
  ministryOffice?: MissionLeaderOffice;
  /**
   * Appointed System Admin for `systemId` — operate the software (accounts,
   * invites, role plumbing), not domain data dumps. Never implies finance/sacraments.
   */
  systemAdmin?: boolean;
  /**
   * Governance positions (pastor, secretary) may open every system.
   * Otherwise access is limited to `systemId` when set.
   */
  grantsAllSystems?: boolean;
  systemId?: SystemId;
  status: ParticipationStatus;
  startDate: string;
  endDate?: string;
}

/** Temporary context role — program / project / event. */
export type AssignmentContextType = 'PROGRAM' | 'PROJECT' | 'EVENT';

export type AssignmentStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface Assignment {
  id: string;
  personId: string;
  title: string;
  contextType: AssignmentContextType;
  contextId: string;
  contextLabel: string;
  orgUnitId?: string;
  /** Temporary system entry while assignment is active. */
  systemId?: SystemId;
  status: AssignmentStatus;
  startDate: string;
  endDate?: string;
}

export type EntitlementSource =
  | 'GOVERNANCE'
  | 'MEMBERSHIP'
  | 'POSITION'
  | 'ASSIGNMENT'
  | 'TASK'
  | 'ACCOUNT';

export interface SystemEntitlement {
  systemId: SystemId;
  sources: EntitlementSource[];
  /** Human-readable reasons (for UI / audit). */
  reasons: string[];
}

/** Short-lived handoff between peer systems (same Account, no re-login). */
export interface SsoHandoffToken {
  id: string;
  accountId: string;
  fromSystemId: SystemId;
  toSystemId: SystemId;
  issuedAt: number;
  expiresAt: number;
}

export interface SessionState {
  accountId: string;
  /** Which system the user is currently inside. */
  currentSystemId: SystemId;
  /** How they entered this system. */
  entryMode: 'direct' | 'handoff' | 'main';
  /** Active named choir when inside sys-choir (multi-tenant isolation). */
  activeChoirOrgUnitId?: string;
}

/** Protected resource kinds in the ecosystem. */
export type Resource =
  | 'SYSTEM'
  | 'PERSON'
  | 'ORG_UNIT'
  | 'MEMBERSHIP'
  | 'POSITION'
  | 'ASSIGNMENT'
  | 'PROGRAM'
  | 'ACTIVITY'
  | 'EVENT'
  | 'TASK'
  | 'PROJECT'
  | 'FINANCE'
  | 'CHOIR_REPERTOIRE'
  | 'CHOIR_ROSTER'
  | 'CHOIR_FINANCE'
  | 'WORSHIP_REPERTOIRE'
  | 'WORSHIP_ROSTER'
  | 'WORSHIP_FINANCE'
  | 'YOUTH_GROUP'
  | 'PROTOCOL_ROSTER'
  | 'PROTOCOL_SCHEDULE'
  | 'DEACON_ROSTER'
  | 'DEACON_CARE'
  | 'DEACON_FINANCE'
  | 'MINISTRY_FINANCE'
  | 'AUDIT'
  /** Software config for a system (invites, role plumbing) — not domain ledgers. */
  | 'SYSTEM_CONFIG'
  /** Itorero Board of Directors meetings & decisions. */
  | 'BOARD'
  /** Official letters & correspondence (request → document → version → sign). */
  | 'CORRESPONDENCE';

export type Action =
  | 'ENTER'
  | 'VIEW'
  | 'VIEW_FULL'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'MANAGE'
  | 'LINK_ACCOUNT'
  | 'RECORD_ATTENDANCE'
  | 'APPROVE';

export type PermissionSource =
  | 'GOVERNANCE'
  | 'POSITION'
  | 'MEMBERSHIP'
  | 'ASSIGNMENT'
  | 'TASK'
  | 'ACCOUNT';

/** Church-visible vs org-private (no pastor bypass). */
export type ResourceSensitivity = 'CHURCH' | 'ORG_PRIVATE';

export const RESOURCE_SENSITIVITY: Record<Resource, ResourceSensitivity> = {
  SYSTEM: 'CHURCH',
  PERSON: 'CHURCH',
  ORG_UNIT: 'CHURCH',
  MEMBERSHIP: 'CHURCH',
  POSITION: 'CHURCH',
  ASSIGNMENT: 'CHURCH',
  PROGRAM: 'CHURCH',
  ACTIVITY: 'CHURCH',
  EVENT: 'CHURCH',
  TASK: 'CHURCH',
  PROJECT: 'CHURCH',
  FINANCE: 'ORG_PRIVATE',
  CHOIR_REPERTOIRE: 'CHURCH',
  CHOIR_ROSTER: 'CHURCH',
  CHOIR_FINANCE: 'CHURCH',
  WORSHIP_REPERTOIRE: 'CHURCH',
  WORSHIP_ROSTER: 'CHURCH',
  WORSHIP_FINANCE: 'CHURCH',
  YOUTH_GROUP: 'CHURCH',
  PROTOCOL_ROSTER: 'CHURCH',
  PROTOCOL_SCHEDULE: 'CHURCH',
  DEACON_ROSTER: 'CHURCH',
  DEACON_CARE: 'CHURCH',
  DEACON_FINANCE: 'CHURCH',
  MINISTRY_FINANCE: 'CHURCH',
  AUDIT: 'CHURCH',
  SYSTEM_CONFIG: 'CHURCH',
  BOARD: 'CHURCH',
  CORRESPONDENCE: 'CHURCH',
};

/** A concrete right held right now in a system (optionally fund-scoped). */
export interface PermissionGrant {
  systemId: SystemId;
  resource: Resource;
  action: Action;
  source: PermissionSource;
  reason: string;
}

export interface AuthzRequest {
  personId: string;
  systemId: SystemId;
  resource: Resource;
  action: Action;
  now?: Date;
}

export interface AuthzDecision {
  allowed: boolean;
  personId: string;
  systemId: SystemId;
  resource: Resource;
  action: Action;
  matchedGrant?: PermissionGrant;
  reason: string;
  evaluatedAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  personId: string;
  systemId: SystemId;
  resource: Resource;
  action: Action;
  allowed: boolean;
  reason: string;
  entryMode?: SessionState['entryMode'];
}

export type ProgramStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'SETUP'
  | 'ACTIVE'
  | 'PAUSED'
  | 'CLOSING'
  | 'ENDED';

export type ProgramType =
  | 'CLASS'
  | 'SMALL_GROUP'
  | 'FELLOWSHIP'
  | 'SERVING_TEAM'
  | 'DISCIPLESHIP'
  | 'OTHER';

/**
 * Dual mission scope (locked product rule):
 * - CHURCH — general church / published; Main + every system’s general lane
 * - MINISTRY_PRIVATE — default; owning ministry (leaders + members with ENTER)
 * - SELECTIVE — only listed people via MissionShareGrant (+ mission leaders)
 */
export type MissionVisibility = 'CHURCH' | 'MINISTRY_PRIVATE' | 'SELECTIVE';

/** Offices that may CRUD mission items and publish to church. */
export type MissionLeaderOffice =
  | 'PRESIDENT'
  | 'VP'
  | 'SECRETARY'
  | 'TREASURER';

export type MissionResourceKind = 'PROGRAM' | 'EVENT' | 'TASK' | 'PROJECT';

/**
 * Selective share — person may VIEW or MANAGE a specific mission item
 * outside (or inside) the default ministry audience.
 */
export interface MissionShareGrant {
  id: string;
  kind: MissionResourceKind;
  resourceId: string;
  personId: string;
  action: 'VIEW' | 'MANAGE';
  grantedByPersonId: string;
  reason?: string;
  status: 'ACTIVE' | 'REVOKED';
  startDate: string;
  endDate?: string;
}

/** Recurring ministry / discipleship program (standing or cohort intake). */
export interface Program {
  id: string;
  name: string;
  description: string;
  orgUnitId?: string;
  /** Owning peer system (Main or ministry). */
  ownerSystemId: SystemId;
  /** General church vs owning-system private. */
  visibility: MissionVisibility;
  status: ProgramStatus;
  programType?: ProgramType;
  scheduleHint?: string;
  /** Standing program this cohort belongs to (omit for standing). */
  parentProgramId?: string;
  /** Season label e.g. "2026 Q3". */
  cohortLabel?: string;
  createdByPersonId?: string;
  approvedByPersonId?: string;
  approvedAt?: string;
  /** Recommended facilitators / leaders. */
  leaderPersonIds?: string[];
  /**
   * Roles active inside this open program (template + custom).
   * Permissions follow these — not system office.
   */
  roles?: import('./programRoles').ProgramRoleDef[];
  /** Eligibility within audience pool (age, married, invite-only…). */
  eligibility?: import('./audiencePool').ProgramEligibility;
  /** Delivery checklist, close-out and health. Money is not kept on a mission. */
  deliveryItems?: import('./stewardship').MissionDeliveryItem[];
  closeout?: import('./stewardship').MissionCloseout;
  healthSnapshots?: import('./stewardship').MissionHealthSnapshot[];
  blockers?: import('./deliveryRisk').MissionBlocker[];
  /** W5 impact: objectives → indicators → values. */
  objectives?: import('./impact').ProgramObjective[];
}

export type ProgramEnrollmentStatus =
  | 'ACTIVE'
  | 'COMPLETED'
  | 'WITHDRAWN'
  | 'ENDED';

export type ProgramEnrollmentRole = 'LEADER' | 'PARTICIPANT';

/** Person on a program / cohort roster. */
export interface ProgramEnrollment {
  id: string;
  programId: string;
  personId: string;
  /** Legacy coarse role — kept for older UI. */
  role: ProgramEnrollmentRole;
  /** Program role key (FACILITATOR, PARTICIPANT, custom…). */
  roleKey?: string;
  status: ProgramEnrollmentStatus;
  enrolledOn: string;
  endedOn?: string;
  completedOn?: string;
}

/** One session / occurrence of a Program. */
export interface Activity {
  id: string;
  programId: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  /** When set, Session Mode is closed — no further attendance edits. */
  sessionClosedAt?: string;
  /** Soft recurring series (W6). */
  seriesId?: string;
  seriesLabel?: string;
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface Attendance {
  id: string;
  activityId: string;
  personId: string;
  status: AttendanceStatus;
  recordedAt: string;
}

export type ChurchEventType =
  | 'CONFERENCE'
  | 'BAPTISM'
  | 'WEDDING'
  | 'CONCERT'
  | 'RETREAT'
  | 'SEMINAR'
  | 'SPECIAL_SERVICE'
  | 'CAMPAIGN'
  | 'OTHER';

export type ChurchEventStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'PLANNED'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED';

/** Chosen at create — locked research rule. */
export type EventRegistrationMode =
  | 'ANNOUNCEMENT_ONLY'
  | 'REGISTRATION_REQUIRED';

export type EventApprovalLevelKind = 'OWNER' | 'PARENT' | 'CHURCH';

export interface EventApprovalRecord {
  levelKey: string;
  kind: EventApprovalLevelKind;
  label: string;
  systemId?: SystemId;
  personId: string;
  approvedAt: string;
}

export type EventLifecyclePhase = 'PREPARE' | 'DELIVER' | 'CLOSE';

export interface ChurchEvent {
  id: string;
  name: string;
  type: ChurchEventType;
  description?: string;
  orgUnitId?: string;
  ownerSystemId: SystemId;
  visibility: MissionVisibility;
  startsAt: string;
  endsAt?: string;
  location?: string;
  status: ChurchEventStatus;
  /** Always set on create (defaults for legacy rows). */
  registrationMode?: EventRegistrationMode;
  capacity?: number;
  /**
   * When true, every upper level in the org chain must approve before CONFIRMED
   * (e.g. Choir concert → Music → Church). Rehearsal/meeting: false.
   */
  beyondOwnerScope?: boolean;
  approvals?: EventApprovalRecord[];
  createdByPersonId?: string;
  /** Recurring dated series (not Program Activities). */
  seriesId?: string;
  seriesLabel?: string;
  /** Optional link to a Program (special occasion for that program). */
  programId?: string;
  /** Optional link to a Project / season (dress rehearsal, workshop…). */
  projectId?: string;
  /** Peer systems collaborating on this event. */
  collaboratorSystemIds?: SystemId[];
  /** People collaborating outside owner roster. */
  collaboratorPersonIds?: string[];
  /** Prepare → deliver → close operating phase. */
  lifecyclePhase?: EventLifecyclePhase;
  /**
   * Calendar taxonomy for Church Leader awareness / approve.
   * MINISTRY_INTERNAL stays inside ministry; others need Itorero date yes.
   */
  calendarScope?: ChurchCalendarScope;
}

export type EventRegistrationStatus =
  | 'REGISTERED'
  | 'WAITLIST'
  | 'CANCELLED'
  | 'ATTENDED'
  | 'NO_SHOW';

export interface EventRegistration {
  id: string;
  eventId: string;
  personId: string;
  status: EventRegistrationStatus;
  registeredOn: string;
  attendedAt?: string;
  /** When promoted from waitlist. */
  promotedAt?: string;
  /** Seat offer deadline (ISO); after this, seat returns to waitlist FIFO. */
  offerExpiresAt?: string;
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export type TaskContextType = 'PROGRAM' | 'EVENT' | 'PROJECT' | 'NONE';

/**
 * Atomic work item. When active with systemId + grantsSystemAccess,
 * it can grant temporary SYSTEM ENTER (like an Assignment).
 * Primary assignee + optional helpers are both Responsible.
 * On DONE/CANCELLED, grantsSystemAccess is cleared (Option A — record only).
 */
export interface WorkTask {
  id: string;
  title: string;
  description?: string;
  /** Primary Responsible (required). */
  ownerPersonId: string;
  /** Additional Responsible helpers (optional). */
  helperPersonIds?: string[];
  createdByPersonId?: string;
  contextType: TaskContextType;
  contextId?: string;
  contextLabel?: string;
  systemId?: SystemId;
  /** When true, active task entitles entry to systemId (owner + helpers). */
  grantsSystemAccess?: boolean;
  /** Set when access was cleared on DONE/CANCEL. */
  accessRevokedAt?: string;
  /** Defaults to CHURCH when omitted in older rows — always set in seed. */
  visibility: MissionVisibility;
  status: TaskStatus;
  dueDate?: string;
  startDate: string;
  endDate?: string;
  /** Optional close note (Option A — no guided next steps). */
  outcomeNote?: string;
  /** W4: task IDs this task depends on (soft gate). */
  dependsOn?: string[];
  /** W4 RACI: Accountable (A). Responsible = owner + helpers. */
  accountablePersonId?: string;
  /** W4 RACI: Consulted/Informed watchers. */
  watcherPersonIds?: string[];
}

/**
 * Finite initiative that can own many Tasks.
 * Scope approval like Events; shared collaborators.
 */
export type ChurchProjectStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'PLANNED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'CLOSING'
  | 'DONE'
  | 'CANCELLED';

export interface ChurchProject {
  id: string;
  name: string;
  description?: string;
  ownerSystemId: SystemId;
  orgUnitId?: string;
  visibility: MissionVisibility;
  status: ChurchProjectStatus;
  startDate?: string;
  endDate?: string;
  /** Parent programme (ongoing container) when this is a season/cohort. */
  programId?: string;
  /** Recommended lead (not required). */
  leadPersonId?: string;
  /** Peer systems collaborating on one shared project. */
  collaboratorSystemIds?: SystemId[];
  collaboratorPersonIds?: string[];
  /**
   * When true, every upper level in the org chain must approve before ACTIVE
   * (same rule as Events).
   */
  beyondOwnerScope?: boolean;
  approvals?: EventApprovalRecord[];
  createdByPersonId?: string;
  /** Option A close note. */
  outcomeNote?: string;
  /** Delivery checklist, close-out and health. Money is not kept on a mission. */
  deliveryItems?: import('./stewardship').MissionDeliveryItem[];
  closeout?: import('./stewardship').MissionCloseout;
  healthSnapshots?: import('./stewardship').MissionHealthSnapshot[];
  blockers?: import('./deliveryRisk').MissionBlocker[];
}

/* ─── Choir System domain (peer app data; Person IDs shared) ─── */

/**
 * Standing office inside a named choir.
 * Administrative: President, VP, Treasurer, Secretary.
 * Operations: Music Director, Coordinator (head of all families), Advisor (custom slot).
 * Structural: Family Leader, Member.
 */
export type ChoirOffice =
  | 'PRESIDENT'
  | 'VP'
  | 'TREASURER'
  | 'SECRETARY'
  | 'MUSIC_DIRECTOR'
  | 'COORDINATOR'
  | 'ADVISOR'
  | 'FAMILY_LEADER'
  | 'MEMBER';

export interface ChoirSong {
  id: string;
  orgUnitId: string;
  title: string;
  composer?: string;
  language?: string;
  status: 'LEARNING' | 'READY' | 'ARCHIVED';
  notes?: string;
}

export interface ChoirRehearsal {
  id: string;
  orgUnitId: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  songIds: string[];
  notes?: string;
}

/**
 * Choir "family" = internal team/squad (not household relatives).
 */
export interface ChoirTeam {
  id: string;
  orgUnitId: string;
  name: string;
  code: string;
  leaderPersonId?: string;
  viceLeaderPersonId?: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ChoirTeamMember {
  id: string;
  teamId: string;
  personId: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ChoirRosterMember {
  id: string;
  orgUnitId: string;
  personId: string;
  office: ChoirOffice;
  /** When office is ADVISOR — e.g. "Spiritual leader", "Social & outreach". */
  advisorRole?: string;
  teamId?: string;
  status: 'ACTIVE' | 'INACTIVE';
}

/**
 * Old Worship team offices. Worship is becoming a choir of kind Worship (Choir
 * design); this type goes when the seeded Worship positions move to the choir
 * unit in the people-and-units slice.
 */
export type WorshipOffice =
  | 'ADMIN'
  | 'PRESIDENT'
  | 'VP'
  | 'SECRETARY'
  | 'TREASURER'
  | 'COORDINATOR'
  | 'MUSIC_DIRECTOR'
  | 'FAMILY_LEADER'
  | 'FAMILY_VICE'
  | 'MEMBER';

/* ─── Deacon domain (care design is on hold; roster only) ─── */

export type DeaconOffice =
  | 'COORDINATOR'
  | 'PRESIDENT'
  | 'SECRETARY'
  | 'TREASURER'
  | 'MEMBER';

export interface DeaconRosterMember {
  id: string;
  personId: string;
  office: DeaconOffice;
  status: 'ACTIVE' | 'INACTIVE';
}

/* ─── Youth System domain ─── */

export interface YouthGroup {
  id: string;
  name: string;
  description: string;
  ageLabel?: string;
  mentorPersonIds: string[];
  status: 'ACTIVE' | 'PAUSED';
}

export type YouthMemberRole = 'MEMBER' | 'MENTOR' | 'LEADER';

export interface YouthGroupMember {
  id: string;
  groupId: string;
  personId: string;
  role: YouthMemberRole;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface YouthMeeting {
  id: string;
  groupId: string;
  title: string;
  topic?: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
}

/* ─── Protocol Management System (PMS) ─── */

/** Standing office inside Protocol (not the shared SystemRole enum). */
export type ProtocolOffice =
  | 'PRESIDENT'
  | 'VP'
  | 'SECRETARY'
  | 'TREASURER'
  | 'COORDINATOR'
  | 'MEMBER';

/**
 * Broad serve-day preference. Narrower leader-excused limits use
 * `allowedServiceKinds` (e.g. Tuesday-only or SS1-only).
 */
export type ServeDayCapability = 'SUNDAY' | 'TUESDAY' | 'BOTH';

export interface ProtocolRosterMember {
  id: string;
  personId: string;
  office: ProtocolOffice;
  serveDays: ServeDayCapability;
  /**
   * Leader-excused limits — only these kinds (e.g. `['TUESDAY']` or `['SS1']`).
   * When omitted, `serveDays` applies.
   */
  allowedServiceKinds?: ProtocolServiceKind[];
  status: 'ACTIVE' | 'INACTIVE' | 'LEAVE';
  /** ISO dates this person must not be scheduled. */
  unavailableDates: string[];
  /**
   * Particular services this person can do (e.g. 4 Oct SS1, 11 Oct SS2).
   * In any month where at least one is listed, only the listed services are
   * used for them; months with none follow the usual rule.
   */
  onlyServices?: { date: string; kind: ProtocolServiceKind }[];
  /** The member's choir (a Music unit id), or none. Shared with every browser. */
  choirUnitId?: string;
  notes?: string;
  /** Name/email as of when they were added, so every browser can show them. */
  displayName?: string;
  email?: string;
}

/** Protocol never staffs Friday — Music may still schedule choirs there. */
export type ProtocolServiceKind = 'SS1' | 'SS2' | 'TUESDAY' | 'IGABURO';

/** One service slot synced from a published Music schedule (no Friday). */
export interface ProtocolService {
  id: string;
  monthKey: string;
  date: string;
  kind: ProtocolServiceKind;
  label: string;
  targetTeamSize: number;
  /** Music service id this slot mirrors. */
  musicServiceId?: string;
}

export type ProtocolMonthStatus = 'OPEN' | 'DRAFT' | 'REVIEW' | 'PUBLISHED';

export interface ProtocolMonthPlan {
  monthKey: string;
  status: ProtocolMonthStatus;
  version: number;
  generatedAt?: string;
  validationNotes: string[];
  submittedForReviewAt?: string;
  submittedByPersonId?: string;
  reviewedAt?: string;
  reviewedByPersonId?: string;
  publishedAt?: string;
  publishedByPersonId?: string;
  /** Music schedule version these teams were built against. */
  musicVersionBuiltOn?: number;
  /** date|kind → sorted Music unit ids at build time (for change diffs). */
  musicSnapshot?: Record<string, string[]>;
  /** Stale-Music notification already sent for the current baseline. */
  musicStaleNotified?: boolean;
  /** Coordinator-approved exceptions to blocking issues. */
  overrides?: ProtocolIssueOverride[];
  /**
   * Coordinator relaxed the choir/Worship-on-service rule for Tuesdays this
   * month (so more people can fill the team). Always recorded with a reason.
   */
  relaxTuesdayChoirRule?: boolean;
  relaxReason?: string;
  relaxedByPersonId?: string;
  relaxedAt?: string;
}

export type ProtocolIssueSeverity = 'BLOCKING' | 'WARNING';

export type ProtocolIssueCode =
  | 'DOUBLE_SUNDAY'
  | 'CHOIR_NOT_SCHEDULED'
  | 'WORSHIP_NOT_SCHEDULED'
  | 'NOT_ACTIVE'
  | 'CANNOT_SERVE'
  | 'UNKNOWN_PERSON'
  | 'OVER_MAX'
  | 'TEAM_SHORT'
  | 'TEAM_OVER';

export interface ProtocolIssue {
  /** Stable identity: survives re-validation, used to attach overrides. */
  key: string;
  code: ProtocolIssueCode;
  severity: ProtocolIssueSeverity;
  message: string;
  serviceId?: string;
  personId?: string;
}

export interface ProtocolIssueOverride {
  issueKey: string;
  reason: string;
  byPersonId: string;
  at: string;
}

/** Temporary per-service leadership — expires when that service ends. */
export type ProtocolTeamRole = 'MEMBER' | 'TEAM_LEADER' | 'VICE_LEADER';

/** REGULAR counts toward monthly 3; EXTRA = 4th; FILL_IN does not count as official. */
export type ProtocolSlotKind = 'REGULAR' | 'EXTRA' | 'FILL_IN';

export type ProtocolRoleDecision =
  | 'RECOMMENDED'
  | 'APPROVED'
  | 'DECLINED'
  | 'MANUAL';

export interface ProtocolTeamSlot {
  id: string;
  serviceId: string;
  personId: string;
  source: 'ENGINE' | 'MANUAL' | 'FILL_IN' | 'SWAP';
  role: ProtocolTeamRole;
  /** Engine suggestion for TL/VTL before coordinator decision. */
  recommendedRole?: ProtocolTeamRole;
  roleStatus?: ProtocolRoleDecision;
  slotKind: ProtocolSlotKind;
  /** When this row is a fill-in, who was excused. */
  replacedPersonId?: string;
}

/** Immutable snapshot after publish (history / archive). */
export interface ProtocolScheduleVersion {
  id: string;
  monthKey: string;
  version: number;
  publishedAt: string;
  publishedByPersonId: string;
  slots: ProtocolTeamSlot[];
  validationNotes: string[];
}

export type ProtocolAttendanceStatus =
  | 'PRESENT'
  | 'HALF_PRESENT'
  | 'EXCUSED'
  | 'ABSENT';

export interface ProtocolAttendanceRecord {
  id: string;
  serviceId: string;
  personId: string;
  status: ProtocolAttendanceStatus;
  recordedByPersonId: string;
  recordedAt: string;
  notes?: string;
  /** Snapshot of slot kind at record time (for member performance scoring). */
  slotKind?: ProtocolSlotKind;
}

export type ProtocolAbsenceRequestStatus =
  | 'PENDING'
  | 'EXCUSED'
  | 'DENIED';

/** Member asks TL/VTL to be excused from a scheduled service. */
export interface ProtocolAbsenceRequest {
  id: string;
  serviceId: string;
  personId: string;
  reason: string;
  status: ProtocolAbsenceRequestStatus;
  createdAt: string;
  decidedByPersonId?: string;
  decidedAt?: string;
}

export type ProtocolFillInStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CANCELLED';

export interface ProtocolFillInOffer {
  id: string;
  serviceId: string;
  excusedPersonId: string;
  candidatePersonId: string;
  offeredByPersonId: string;
  status: ProtocolFillInStatus;
  createdAt: string;
  respondedAt?: string;
}

export type ProtocolSwapStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CANCELLED';

/** Member proposes swapping into another member's scheduled service. */
export interface ProtocolSwapProposal {
  id: string;
  serviceId: string;
  proposerPersonId: string;
  targetPersonId: string;
  status: ProtocolSwapStatus;
  createdAt: string;
  respondedAt?: string;
}

/** TL/VTL service report for one service. */
export interface ProtocolServiceReport {
  id: string;
  serviceId: string;
  authorPersonId: string;
  challenges: string;
  solutions: string;
  issues: string;
  recommendations: string;
  submittedAt: string;
}

export type ProtocolNotificationKind =
  | 'TEAMS_BUILT'
  | 'SUBMITTED_REVIEW'
  | 'SCHEDULE_PUBLISHED'
  | 'CONTRIBUTION_SUBMITTED'
  | 'CONTRIBUTION_VERIFIED'
  | 'ABSENCE_REQUEST'
  | 'FILL_IN_OFFER'
  | 'SWAP_PROPOSAL'
  | 'MUSIC_CHANGED'
  | 'MUSIC_CONFIRMED'
  | 'MUSIC_PUBLISHED'
  | 'MUSIC_EDITED'
  | 'GENERAL';

export interface ProtocolNotification {
  id: string;
  personId: string;
  kind: ProtocolNotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href?: string;
}

export interface ProtocolActivityEvent {
  id: string;
  at: string;
  actorPersonId: string;
  kind: ProtocolNotificationKind | 'ATTENDANCE' | 'EXPORT';
  summary: string;
}

export interface ProtocolSchedulingRules {
  /** Official monthly serve target (not fill-ins). */
  preferTarget: number;
  /** Soft ceiling before allowing Extra (normally = preferTarget). */
  softMax: number;
  /** Absolute max including one Extra (preferTarget + 1). */
  hardMax: number;
  defaultTeamSize: number;
  /**
   * When true, choir members may only be placed on services where Music
   * scheduled their choir (hard block, not soft deprioritize).
   */
  requireChoirOnService: boolean;
  /**
   * Same rule for the Worship team: a member of it may only be placed on
   * services where Worship is scheduled (Tuesdays). Defaults to on.
   */
  requireWorshipOnService?: boolean;
  /**
   * Service kinds on which the choir/Worship-on-service rule is not applied
   * (set per month by the Coordinator — e.g. ['TUESDAY']).
   */
  relaxChoirOnKinds?: ProtocolServiceKind[];
}

/* ─── Calendar scope ─── */

/** Church-wide / sanctuary / large ministry date taxonomy for calendar. */
export type ChurchCalendarScope =
  | 'MINISTRY_INTERNAL'
  | 'LARGE_MINISTRY'
  | 'SANCTUARY'
  | 'CHURCH_WIDE';

