/** Protocol types, carried over from the old system. */

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

