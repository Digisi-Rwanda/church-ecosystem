import {
  ACTIVITIES,
  ATTENDANCE,
  EVENT_REGISTRATIONS,
  EVENTS,
  MEMBERSHIPS,
  MISSION_SHARES,
  PROGRAMS,
  PROGRAM_ENROLLMENTS,
  PROJECTS,
  TASKS,
  pushMissionShare,
  updateMissionShare,
} from '../data/seed';
import { scheduleLocalDomainPersist } from '../data/localDomainStore';
import {
  matchesEligibility,
  personInAudiencePool,
  systemsInAudiencePool,
  type ProgramEligibility,
} from '../domain/audiencePool';
import { eventSpendPolicyOk } from '../domain/eventOps';
import {
  isChurchLeader,
  isItoreroHighLeader,
} from '../domain/churchLeadership';
import { TASK_TEMPLATES } from '../domain/taskTemplates';
import {
  findRole,
  legacyRoleKey,
  roleHasPermission,
  rolesFromProgramType,
  type ProgramRoleDef,
  type ProgramRolePermission,
} from '../domain/programRoles';
import {
  canManageMissionBoard,
  isChurchMissionAdmin,
  isMissionLeader,
  missionItemVisibleTo,
  partitionMissionItems,
  shareIsActive,
} from '../domain/missionScope';
import {
  attendanceCount,
  calendarItems,
  isTaskActive,
} from '../domain/permissions';
import {
  canApproveEventLevel,
  eventApprovalChain,
  eventApprovalsSatisfied,
  missingEventApprovals,
  registrationModeOf,
  scopeApprovalChain,
  scopeApprovalsSatisfied,
  missingScopeApprovals,
  canApproveScopeLevel,
} from '../domain/eventScope';
import type {
  Activity,
  Attendance,
  AttendanceStatus,
  ChurchEvent,
  ChurchProject,
  EventLifecyclePhase,
  EventRegistration,
  EventRegistrationMode,
  EventRegistrationStatus,
  MembershipType,
  MissionShareGrant,
  MissionVisibility,
  Position,
  Program,
  ProgramEnrollment,
  ProgramEnrollmentRole,
  ProgramType,
  SystemId,
  SystemRole,
  WorkTask,
} from '../domain/types';
import {
  deliveryReadyToClose,
  openAdvances,
  requiredDeliveryOpen,
  type DeliveryItemKind,
  type DeliveryItemStatus,
  type DeliveryItemTier,
  type FundingSourceStatus,
  type FundingSourceType,
  type LeftoverDecision,
  type MissionAdvance,
  type MissionBudgetLine,
  type MissionCloseout,
  type MissionDeliveryItem,
  type MissionFundingSource,
  type MissionInKind,
  type MissionPhaseRenewal,
  type MissionStewardship,
} from '../domain/stewardship';
import { peopleService } from './authService';
import { financeService } from './financeService';
import { participationService } from './participationService';
import { systemsService } from './orgService';
import { FUNDS } from '../data/financeSeed';

export type MissionStewardKind = 'PROGRAM' | 'PROJECT';

function nid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type ViewOpts = {
  personId?: string;
  positions?: Position[];
  canEnterOwner?: boolean;
};

function isMarried(personId: string): boolean {
  const m = peopleService.marriage(personId);
  return m?.status === 'MARRIED';
}

function isProgramStaff(
  program: Program,
  personId: string,
  positions?: Position[],
): boolean {
  if (program.leaderPersonIds?.includes(personId)) return true;
  if (program.createdByPersonId === personId) return true;
  const enrollment = PROGRAM_ENROLLMENTS.find(
    (e) =>
      e.programId === program.id &&
      e.personId === personId &&
      e.status === 'ACTIVE',
  );
  if (enrollment) {
    const roles = program.roles ?? rolesFromProgramType(program.programType);
    const key =
      enrollment.roleKey ?? legacyRoleKey(enrollment.role, roles);
    if (findRole(roles, key)?.isStaff) return true;
  }
  if (positions && isMissionLeader(positions, program.ownerSystemId)) {
    return true;
  }
  return false;
}

/**
 * Discover gate: visibility + (staff | share | (pool ∧ eligibility ∧ !invite-only)).
 */
export function canDiscoverProgram(
  program: Program,
  opts: ViewOpts & { memberships?: typeof MEMBERSHIPS },
): boolean {
  const personId = opts.personId;
  if (!personId) return true; // unscoped listing (admin tools)

  if (isProgramStaff(program, personId, opts.positions)) return true;

  if (opts.positions && isChurchMissionAdmin(opts.positions)) return true;

  const hasShare = MISSION_SHARES.some(
    (s) =>
      shareIsActive(s) &&
      s.kind === 'PROGRAM' &&
      s.resourceId === program.id &&
      s.personId === personId,
  );
  if (hasShare) return true;

  if (program.eligibility?.requireInviteOnly) return false;

  const memberships = opts.memberships ?? MEMBERSHIPS;
  if (
    !personInAudiencePool(personId, program.ownerSystemId, memberships)
  ) {
    return false;
  }

  const person = peopleService.getById(personId);
  const elig = matchesEligibility(person, program.eligibility, {
    isMarried: isMarried(personId),
  });
  return elig.ok;
}

export function canEnrollInProgram(
  program: Program,
  personId: string,
  opts?: { asStaff?: boolean; roleKey?: string },
): { ok: boolean; reason?: string } {
  if (opts?.asStaff) return { ok: true };
  const roles = program.roles ?? rolesFromProgramType(program.programType);
  const roleKey = opts?.roleKey ?? 'PARTICIPANT';
  const role = findRole(roles, roleKey);
  if (role?.isStaff) return { ok: true };

  if (program.eligibility?.requireInviteOnly) {
    const hasShare = MISSION_SHARES.some(
      (s) =>
        shareIsActive(s) &&
        s.kind === 'PROGRAM' &&
        s.resourceId === program.id &&
        s.personId === personId,
    );
    if (!hasShare) {
      return { ok: false, reason: 'Invite required to join this program' };
    }
  }

  if (!personInAudiencePool(personId, program.ownerSystemId, MEMBERSHIPS)) {
    return { ok: false, reason: 'Outside audience pool for this program' };
  }

  const person = peopleService.getById(personId);
  return matchesEligibility(person, program.eligibility, {
    isMarried: isMarried(personId),
  });
}

/** @deprecated Prefer isItoreroHighLeader / isChurchLeader — kept for call sites. */
export function isChurchLeadership(roles: SystemRole[]): boolean {
  return isItoreroHighLeader(roles);
}

export { isChurchLeader, isItoreroHighLeader };

export const missionService = {
  canManageBoard(positions: Position[], systemId: SystemId) {
    return canManageMissionBoard(positions, systemId);
  },

  isChurchLeadership,

  listShares(filter?: {
    kind?: MissionShareGrant['kind'];
    resourceId?: string;
    personId?: string;
  }) {
    return MISSION_SHARES.filter((s) => {
      if (!shareIsActive(s) && filter?.resourceId) {
        // still show revoked when listing a resource for UI? only active for access
      }
      if (filter?.kind && s.kind !== filter.kind) return false;
      if (filter?.resourceId && s.resourceId !== filter.resourceId) return false;
      if (filter?.personId && s.personId !== filter.personId) return false;
      return true;
    });
  },

  activeSharesFor(kind: MissionShareGrant['kind'], resourceId: string) {
    return MISSION_SHARES.filter(
      (s) =>
        shareIsActive(s) && s.kind === kind && s.resourceId === resourceId,
    );
  },

  grantShare(input: {
    kind: MissionShareGrant['kind'];
    resourceId: string;
    personId: string;
    action: 'VIEW' | 'MANAGE';
    grantedByPersonId: string;
    reason?: string;
  }): MissionShareGrant {
    const g: MissionShareGrant = {
      id: nid('ms'),
      kind: input.kind,
      resourceId: input.resourceId,
      personId: input.personId,
      action: input.action,
      grantedByPersonId: input.grantedByPersonId,
      reason: input.reason,
      status: 'ACTIVE',
      startDate: new Date().toISOString().slice(0, 10),
    };
    pushMissionShare(g);
    return g;
  },

  revokeShare(id: string) {
    updateMissionShare(id, { status: 'REVOKED' });
  },

  listPrograms(filter?: {
    ownerSystemId?: SystemId;
    status?: Program['status'];
    viewerSystemId?: SystemId;
    viewOpts?: ViewOpts;
  }) {
    return PROGRAMS.filter((p) => {
      if (filter?.ownerSystemId && p.ownerSystemId !== filter.ownerSystemId) {
        return false;
      }
      if (filter?.status && p.status !== filter.status) return false;
      if (filter?.viewerSystemId) {
        if (
          !missionItemVisibleTo(p, filter.viewerSystemId, {
            ...filter.viewOpts,
            shares: MISSION_SHARES,
            kind: 'PROGRAM',
          })
        ) {
          return false;
        }
        if (
          filter.viewOpts?.personId &&
          !canDiscoverProgram(p, filter.viewOpts)
        ) {
          return false;
        }
      }
      return true;
    });
  },

  programsForSystem(viewerSystemId: SystemId, viewOpts?: ViewOpts) {
    return partitionMissionItems(
      this.listPrograms({ viewerSystemId, viewOpts }),
      viewerSystemId,
      { ...viewOpts, shares: MISSION_SHARES, kind: 'PROGRAM' },
    );
  },

  getProgram(id: string): Program | null {
    return PROGRAMS.find((p) => p.id === id) ?? null;
  },

  createProgram(input: {
    name: string;
    description: string;
    ownerSystemId: SystemId;
    visibility?: MissionVisibility;
    orgUnitId?: string;
    scheduleHint?: string;
    programType?: ProgramType;
    parentProgramId?: string;
    cohortLabel?: string;
    createdByPersonId?: string;
    leaderPersonIds?: string[];
    roles?: ProgramRoleDef[];
    eligibility?: ProgramEligibility;
    /** Church leadership may create already ACTIVE. */
    startActive?: boolean;
  }): Program {
    const startActive = input.startActive === true;
    const roles =
      input.roles ?? rolesFromProgramType(input.programType);
    const p: Program = {
      id: nid('prg'),
      name: input.name,
      description: input.description,
      ownerSystemId: input.ownerSystemId,
      visibility: input.visibility ?? 'MINISTRY_PRIVATE',
      orgUnitId: input.orgUnitId,
      scheduleHint: input.scheduleHint,
      programType: input.programType,
      parentProgramId: input.parentProgramId,
      cohortLabel: input.cohortLabel,
      createdByPersonId: input.createdByPersonId,
      leaderPersonIds: input.leaderPersonIds,
      roles,
      eligibility: input.eligibility,
      status: startActive ? 'ACTIVE' : 'DRAFT',
      approvedByPersonId: startActive ? input.createdByPersonId : undefined,
      approvedAt: startActive ? new Date().toISOString() : undefined,
    };
    PROGRAMS.unshift(p);
    scheduleLocalDomainPersist();
    return p;
  },

  updateProgram(id: string, patch: Partial<Program>): Program | null {
    const i = PROGRAMS.findIndex((p) => p.id === id);
    if (i < 0) return null;
    const prev = PROGRAMS[i];
    if (prev.closeout && patch.closeout && patch.closeout !== prev.closeout) {
      /* Immutable close-out — keep archived snapshot forever. */
      const { closeout: _ignored, ...rest } = patch;
      PROGRAMS[i] = { ...prev, ...rest, id, closeout: prev.closeout };
      return PROGRAMS[i];
    }
    PROGRAMS[i] = { ...prev, ...patch, id };
    return PROGRAMS[i];
  },

  upsertProgramObjective(
    programId: string,
    objective: import('../domain/impact').ProgramObjective,
  ): { ok: boolean; reason?: string } {
    const p = this.getProgram(programId);
    if (!p) return { ok: false, reason: 'Program not found' };
    const title = objective.title.trim();
    if (!title) return { ok: false, reason: 'Title required' };
    const list = [...(p.objectives ?? [])];
    const idx = list.findIndex((o) => o.id === objective.id);
    const next = { ...objective, title };
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    this.updateProgram(programId, { objectives: list });
    return { ok: true };
  },

  recordImpactValue(
    programId: string,
    objectiveId: string,
    value: import('../domain/impact').ImpactValue,
  ): { ok: boolean; reason?: string } {
    const p = this.getProgram(programId);
    if (!p) return { ok: false, reason: 'Program not found' };
    if (!(p.objectives ?? []).some((o) => o.id === objectiveId)) {
      return { ok: false, reason: 'Objective not found' };
    }
    const objectives = (p.objectives ?? []).map((o) => {
      if (o.id !== objectiveId) return o;
      return {
        ...o,
        values: [...(o.values ?? []), value],
      };
    });
    this.updateProgram(programId, { objectives });
    return { ok: true };
  },

  publishProgram(id: string): Program | null {
    return this.updateProgram(id, { visibility: 'CHURCH' });
  },

  submitProgramForApproval(id: string): { ok: boolean; reason?: string; program?: Program } {
    const p = this.getProgram(id);
    if (!p) return { ok: false, reason: 'Program not found' };
    if (p.status !== 'DRAFT' && p.status !== 'PAUSED') {
      return { ok: false, reason: 'Only DRAFT (or PAUSED) can be submitted' };
    }
    const program = this.updateProgram(id, { status: 'PENDING_APPROVAL' });
    return program ? { ok: true, program } : { ok: false, reason: 'Update failed' };
  },

  approveProgram(
    id: string,
    approverPersonId: string,
    roles: SystemRole[],
  ): { ok: boolean; reason?: string; program?: Program } {
    if (!isChurchLeader(roles)) {
      return { ok: false, reason: 'Church Leader must approve' };
    }
    const p = this.getProgram(id);
    if (!p) return { ok: false, reason: 'Program not found' };
    if (p.status !== 'PENDING_APPROVAL' && p.status !== 'DRAFT') {
      return { ok: false, reason: 'Not awaiting approval' };
    }
    const program = this.updateProgram(id, {
      status: 'SETUP',
      approvedByPersonId: approverPersonId,
      approvedAt: new Date().toISOString(),
    });
    return program ? { ok: true, program } : { ok: false, reason: 'Update failed' };
  },

  /**
   * SETUP → ACTIVE after calendar/money prep. Soft-warns on funding gap.
   */
  startProgram(
    id: string,
  ): { ok: boolean; reason?: string; program?: Program; gap?: number; openRequired?: number } {
    const p = this.getProgram(id);
    if (!p) return { ok: false, reason: 'Program not found' };
    if (p.status !== 'SETUP') {
      return { ok: false, reason: 'Only SETUP programs can start running' };
    }
    const program = this.updateProgram(id, { status: 'ACTIVE' });
    if (!program) return { ok: false, reason: 'Update failed' };
    const gap =
      (Number(p.plannedCost) || 0) -
      (p.fundingPlan ?? [])
        .filter((f) => f.status === 'CONFIRMED')
        .reduce((s, f) => s + (Number(f.amount) || 0), 0);
    const openReq = requiredDeliveryOpen(p).length;
    return {
      ok: true,
      program,
      gap: gap > 0 ? gap : undefined,
      openRequired: openReq > 0 ? openReq : undefined,
    };
  },

  /** Only a running (or already paused) program can be paused, as on the server. */
  pauseProgram(id: string): Program | null {
    const p = this.getProgram(id);
    if (!p || (p.status !== 'ACTIVE' && p.status !== 'PAUSED')) return null;
    return this.updateProgram(id, { status: 'PAUSED' });
  },

  /** ACTIVE (or PAUSED) → CLOSING — checklist phase before ENDED. */
  beginCloseProgram(
    id: string,
  ): { ok: boolean; reason?: string; program?: Program } {
    const p = this.getProgram(id);
    if (!p) return { ok: false, reason: 'Program not found' };
    if (p.status !== 'ACTIVE' && p.status !== 'PAUSED' && p.status !== 'CLOSING') {
      return {
        ok: false,
        reason: 'Only ACTIVE/PAUSED programs can enter CLOSING',
      };
    }
    if (p.status === 'CLOSING') return { ok: true, program: p };
    const program = this.updateProgram(id, { status: 'CLOSING' });
    return program
      ? { ok: true, program }
      : { ok: false, reason: 'Update failed' };
  },

  /** Abandon close-out — back to ACTIVE. */
  abandonCloseProgram(
    id: string,
  ): { ok: boolean; reason?: string; program?: Program } {
    const p = this.getProgram(id);
    if (!p) return { ok: false, reason: 'Program not found' };
    if (p.status !== 'CLOSING') {
      return { ok: false, reason: 'Not in CLOSING' };
    }
    const program = this.updateProgram(id, { status: 'ACTIVE' });
    return program
      ? { ok: true, program }
      : { ok: false, reason: 'Update failed' };
  },

  /**
   * End program with P0 close-out gates (required delivery + money leftover).
   * Must be in CLOSING (or ACTIVE — auto-enters CLOSING then finishes).
   * Pass `forceClose` only to skip open required delivery (still needs closeout).
   */
  endProgram(
    id: string,
    opts?: {
      closeout?: Omit<MissionCloseout, 'closedAt' | 'closedByPersonId'> & {
        closedByPersonId: string;
      };
      forceClose?: boolean;
      forceReason?: string;
      usedCost?: number;
    },
  ): { ok: boolean; reason?: string; program?: Program } {
    const p = this.getProgram(id);
    if (!p) return { ok: false, reason: 'Program not found' };
    if (p.status === 'ENDED') return { ok: false, reason: 'Already ended' };
    if (p.status === 'ACTIVE' || p.status === 'PAUSED') {
      const entered = this.beginCloseProgram(id);
      if (!entered.ok) return entered;
    }
    const live = this.getProgram(id);
    if (!live || live.status !== 'CLOSING') {
      return {
        ok: false,
        reason: 'Begin close-out first (status must be CLOSING)',
      };
    }
    if (!opts?.closeout) {
      return {
        ok: false,
        reason: 'Close-out required (work + money summary and leftover)',
      };
    }
    const openAdv = openAdvances(live);
    const needsForce = !deliveryReadyToClose(live) || openAdv.length > 0;
    if (needsForce && !opts.forceClose) {
      if (!deliveryReadyToClose(live)) {
        const open = requiredDeliveryOpen(live);
        return {
          ok: false,
          reason: `${open.length} required delivery item(s) still open — finish, waive, or force`,
        };
      }
      return {
        ok: false,
        reason: `${openAdv.length} open advance(s) must be retired — or force close`,
      };
    }
    if (opts.forceClose && needsForce) {
      const reason = (opts.forceReason ?? opts.closeout.forceReason ?? '').trim();
      if (reason.length < 8) {
        return {
          ok: false,
          reason: 'Force close requires a reason (at least 8 characters)',
        };
      }
    }
    const used =
      opts.usedCost !== undefined
        ? opts.usedCost
        : live.usedCost !== undefined
          ? live.usedCost
          : 0;
    const forceReason =
      opts.forceClose && needsForce
        ? (opts.forceReason ?? opts.closeout.forceReason ?? '').trim()
        : undefined;
    const closeout: MissionCloseout = {
      ...opts.closeout,
      forceReason,
      closedAt: new Date().toISOString(),
      plannedCostSnapshot: live.plannedCost,
      usedCostSnapshot: used,
      confirmedFundingSnapshot: (live.fundingPlan ?? [])
        .filter((f) => f.status === 'CONFIRMED')
        .reduce((s, f) => s + (Number(f.amount) || 0), 0),
      participantsServedSnapshot: this.listEnrollments(id).filter(
        (e) =>
          e.status === 'ACTIVE' ||
          e.status === 'COMPLETED' ||
          e.status === 'ENDED',
      ).length,
    };
    const today = new Date().toISOString().slice(0, 10);
    for (const e of PROGRAM_ENROLLMENTS) {
      if (e.programId === id && e.status === 'ACTIVE') {
        e.status = 'ENDED';
        e.endedOn = today;
      }
    }
    const program = this.updateProgram(id, {
      status: 'ENDED',
      usedCost: used,
      closeout,
    });
    return program
      ? { ok: true, program }
      : { ok: false, reason: 'Update failed' };
  },

  cohortsOf(parentProgramId: string): Program[] {
    return PROGRAMS.filter((p) => p.parentProgramId === parentProgramId);
  },

  standingPrograms(filter?: {
    ownerSystemId?: SystemId;
    viewerSystemId?: SystemId;
    viewOpts?: ViewOpts;
  }): Program[] {
    return this.listPrograms(filter).filter((p) => !p.parentProgramId);
  },

  listEnrollments(programId: string): ProgramEnrollment[] {
    return PROGRAM_ENROLLMENTS.filter((e) => e.programId === programId);
  },

  enroll(input: {
    programId: string;
    personId: string;
    role?: ProgramEnrollmentRole;
    roleKey?: string;
    /** Staff enroll bypasses audience/eligibility. */
    asStaff?: boolean;
  }): { ok: boolean; reason?: string; enrollment?: ProgramEnrollment } {
    const p = this.getProgram(input.programId);
    if (!p) return { ok: false, reason: 'Program not found' };
    if (
      p.status !== 'ACTIVE' &&
      p.status !== 'PENDING_APPROVAL' &&
      p.status !== 'SETUP'
    ) {
      return {
        ok: false,
        reason: 'Program must be SETUP, ACTIVE, or pending to enroll',
      };
    }
    const exists = PROGRAM_ENROLLMENTS.find(
      (e) =>
        e.programId === input.programId &&
        e.personId === input.personId &&
        e.status === 'ACTIVE',
    );
    if (exists) return { ok: false, reason: 'Already enrolled' };

    const roles = p.roles ?? rolesFromProgramType(p.programType);
    const roleKey =
      input.roleKey ??
      legacyRoleKey(input.role ?? 'PARTICIPANT', roles);
    const gate = canEnrollInProgram(p, input.personId, {
      asStaff: input.asStaff || input.role === 'LEADER',
      roleKey,
    });
    if (!gate.ok) return { ok: false, reason: gate.reason };

    const enrollment: ProgramEnrollment = {
      id: nid('pen'),
      programId: input.programId,
      personId: input.personId,
      role: input.role ?? (findRole(roles, roleKey)?.isStaff ? 'LEADER' : 'PARTICIPANT'),
      roleKey,
      status: 'ACTIVE',
      enrolledOn: new Date().toISOString().slice(0, 10),
    };
    PROGRAM_ENROLLMENTS.unshift(enrollment);
    return { ok: true, enrollment };
  },

  programRoles(programId: string): ProgramRoleDef[] {
    const p = this.getProgram(programId);
    if (!p) return [];
    return p.roles ?? rolesFromProgramType(p.programType);
  },

  ensureProgramRoles(programId: string): ProgramRoleDef[] {
    const p = this.getProgram(programId);
    if (!p) return [];
    if (p.roles?.length) return p.roles;
    const roles = rolesFromProgramType(p.programType);
    this.updateProgram(programId, { roles });
    return roles;
  },

  addProgramRole(
    programId: string,
    role: ProgramRoleDef,
  ): { ok: boolean; reason?: string } {
    const p = this.getProgram(programId);
    if (!p) return { ok: false, reason: 'Program not found' };
    const roles = [...(p.roles ?? rolesFromProgramType(p.programType))];
    if (roles.some((r) => r.key === role.key)) {
      return { ok: false, reason: 'Role key already exists' };
    }
    roles.push(role);
    this.updateProgram(programId, { roles });
    return { ok: true };
  },

  enrollmentRole(
    programId: string,
    personId: string,
  ): ProgramRoleDef | undefined {
    const p = this.getProgram(programId);
    if (!p) return undefined;
    const roles = p.roles ?? rolesFromProgramType(p.programType);
    const e = PROGRAM_ENROLLMENTS.find(
      (x) =>
        x.programId === programId &&
        x.personId === personId &&
        x.status === 'ACTIVE',
    );
    if (!e) {
      if (p.leaderPersonIds?.includes(personId)) {
        return roles.find((r) => r.isStaff) ?? roles[0];
      }
      return undefined;
    }
    const key = e.roleKey ?? legacyRoleKey(e.role, roles);
    return findRole(roles, key);
  },

  canInProgram(
    programId: string,
    personId: string,
    permission: ProgramRolePermission,
  ): boolean {
    const role = this.enrollmentRole(programId, personId);
    return roleHasPermission(role, permission);
  },

  audiencePoolSystems(ownerSystemId: SystemId): SystemId[] {
    return systemsInAudiencePool(ownerSystemId);
  },

  canDiscoverProgram,
  canEnrollInProgram,

  /**
   * Complete enrollment: timeline + optional certificate; enrollment COMPLETED.
   * Option B next steps are applied only when caller passes confirmed actions.
   */
  completeEnrollment(input: {
    enrollmentId: string;
    issueCertificate?: boolean;
    actorPersonId?: string;
    roles?: SystemRole[];
    nextSteps?: {
      addMembershipType?: MembershipType;
      membershipLabel?: string;
      updateBaptism?: { baptizedOn: string; place?: string };
    };
  }): { ok: boolean; reason?: string } {
    const e = PROGRAM_ENROLLMENTS.find((x) => x.id === input.enrollmentId);
    if (!e) return { ok: false, reason: 'Enrollment not found' };
    if (e.status !== 'ACTIVE') return { ok: false, reason: 'Not an active enrollment' };
    const program = this.getProgram(e.programId);
    if (!program) return { ok: false, reason: 'Program not found' };

    const today = new Date().toISOString().slice(0, 10);
    e.status = 'COMPLETED';
    e.completedOn = today;
    e.endedOn = today;

    peopleService.addTimelineEvent({
      personId: e.personId,
      at: today,
      kind: 'MINISTRY',
      title: `Completed: ${program.name}`,
      detail: program.cohortLabel
        ? `Cohort ${program.cohortLabel}`
        : program.description,
    });

    if (input.issueCertificate) {
      peopleService.addDocument({
        personId: e.personId,
        label: `Certificate — ${program.name}`,
        kind: 'CERTIFICATE',
        issuedOn: today,
        note: program.cohortLabel ?? program.programType,
      });
    }

    const ns = input.nextSteps;
    if (ns?.addMembershipType) {
      participationService.createMembership({
        personId: e.personId,
        type: ns.addMembershipType,
        label: ns.membershipLabel ?? ns.addMembershipType,
      });
    }
    if (ns?.updateBaptism) {
      peopleService.saveBaptism({
        personId: e.personId,
        baptizedOn: ns.updateBaptism.baptizedOn,
        place: ns.updateBaptism.place,
      });
      peopleService.addTimelineEvent({
        personId: e.personId,
        at: ns.updateBaptism.baptizedOn,
        kind: 'BAPTISM',
        title: 'Baptism recorded',
        detail: ns.updateBaptism.place,
      });
    }

    return { ok: true };
  },

  createActivity(input: {
    programId: string;
    title: string;
    startsAt: string;
    endsAt?: string;
    location?: string;
    seriesId?: string;
    seriesLabel?: string;
  }): { ok: boolean; reason?: string; activity?: Activity } {
    const p = this.getProgram(input.programId);
    if (!p) return { ok: false, reason: 'Program not found' };
    if (p.status !== 'ACTIVE' && p.status !== 'SETUP') {
      return {
        ok: false,
        reason: 'Sessions only on SETUP or ACTIVE programs',
      };
    }
    const activity: Activity = {
      id: nid('act'),
      programId: input.programId,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      seriesId: input.seriesId,
      seriesLabel: input.seriesLabel,
    };
    ACTIVITIES.unshift(activity);
    return { ok: true, activity };
  },

  recordAttendance(input: {
    activityId: string;
    personId: string;
    status: AttendanceStatus;
  }): Attendance {
    const existing = ATTENDANCE.findIndex(
      (a) =>
        a.activityId === input.activityId && a.personId === input.personId,
    );
    const row: Attendance = {
      id:
        existing >= 0
          ? ATTENDANCE[existing].id
          : nid('att'),
      activityId: input.activityId,
      personId: input.personId,
      status: input.status,
      recordedAt: new Date().toISOString(),
    };
    if (existing >= 0) ATTENDANCE[existing] = row;
    else ATTENDANCE.unshift(row);
    return row;
  },

  activitiesForProgram(programId: string): Activity[] {
    return ACTIVITIES.filter((a) => a.programId === programId).sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
  },

  listActivities(filter?: {
    viewerSystemId?: SystemId;
    viewOpts?: ViewOpts;
  }): Activity[] {
    const rows = [...ACTIVITIES].sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
    if (!filter?.viewerSystemId) return rows;
    return rows.filter((a) => {
      const program = this.getProgram(a.programId);
      if (!program) return false;
      return missionItemVisibleTo(program, filter.viewerSystemId!, {
        ...filter.viewOpts,
        shares: MISSION_SHARES,
        kind: 'PROGRAM',
      });
    });
  },

  attendanceSummary(activityId: string) {
    return attendanceCount(ATTENDANCE, activityId);
  },

  listEvents(filter?: {
    ownerSystemId?: SystemId;
    viewerSystemId?: SystemId;
    viewOpts?: ViewOpts;
  }): ChurchEvent[] {
    return EVENTS.filter((e) => {
      if (filter?.ownerSystemId && e.ownerSystemId !== filter.ownerSystemId) {
        return false;
      }
      if (filter?.viewerSystemId) {
        const collab =
          e.collaboratorSystemIds?.includes(filter.viewerSystemId) ||
          (!!filter.viewOpts?.personId &&
            e.collaboratorPersonIds?.includes(filter.viewOpts.personId));
        if (
          !collab &&
          !missionItemVisibleTo(e, filter.viewerSystemId, {
            ...filter.viewOpts,
            shares: MISSION_SHARES,
            kind: 'EVENT',
          })
        ) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },

  eventsForSystem(viewerSystemId: SystemId, viewOpts?: ViewOpts) {
    return partitionMissionItems(
      this.listEvents({ viewerSystemId, viewOpts }),
      viewerSystemId,
      { ...viewOpts, shares: MISSION_SHARES, kind: 'EVENT' },
    );
  },

  getEvent(id: string): ChurchEvent | null {
    return EVENTS.find((e) => e.id === id) ?? null;
  },

  createEvent(input: {
    name: string;
    type: ChurchEvent['type'];
    ownerSystemId: SystemId;
    startsAt: string;
    endsAt?: string;
    location?: string;
    description?: string;
    visibility?: MissionVisibility;
    orgUnitId?: string;
    registrationMode: EventRegistrationMode;
    capacity?: number;
    beyondOwnerScope?: boolean;
    createdByPersonId?: string;
    seriesId?: string;
    seriesLabel?: string;
    programId?: string;
    projectId?: string;
    collaboratorSystemIds?: SystemId[];
    collaboratorPersonIds?: string[];
    willSpend?: boolean;
    plannedCost?: number;
  }): ChurchEvent {
    const beyond = input.beyondOwnerScope === true;
    if (input.willSpend) {
      const gate = eventSpendPolicyOk({
        willSpend: true,
        projectId: input.projectId,
        plannedCost: input.plannedCost,
      });
      if (!gate.ok) {
        throw new Error(gate.reason ?? 'Spend policy failed');
      }
    }
    const ownerOrg =
      input.orgUnitId ??
      systemsService.getById(input.ownerSystemId)?.orgUnitId;
    const collabSys = (input.collaboratorSystemIds ?? []).filter(
      (id) => id !== input.ownerSystemId,
    );
    const collabPeople = [...new Set(input.collaboratorPersonIds ?? [])];
    const e: ChurchEvent = {
      id: nid('evt'),
      name: input.name,
      type: input.type,
      ownerSystemId: input.ownerSystemId,
      orgUnitId: ownerOrg,
      visibility: input.visibility ?? 'MINISTRY_PRIVATE',
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      description: input.description,
      registrationMode: input.registrationMode,
      capacity:
        input.registrationMode === 'REGISTRATION_REQUIRED'
          ? input.capacity
          : undefined,
      beyondOwnerScope: beyond,
      createdByPersonId: input.createdByPersonId,
      seriesId: input.seriesId,
      seriesLabel: input.seriesLabel,
      programId: input.programId,
      projectId: input.projectId,
      willSpend: input.willSpend,
      plannedCost: input.plannedCost,
      collaboratorSystemIds: collabSys.length ? collabSys : undefined,
      collaboratorPersonIds: collabPeople.length ? collabPeople : undefined,
      lifecyclePhase: 'PREPARE',
      approvals: [],
      status: beyond ? 'PENDING_APPROVAL' : 'CONFIRMED',
    };
    EVENTS.unshift(e);
    scheduleLocalDomainPersist();
    if (e.projectId) {
      this.ensureEventOnProjectDelivery(e.projectId, e);
    }
    return e;
  },

  updateEvent(id: string, patch: Partial<ChurchEvent>): ChurchEvent | null {
    const i = EVENTS.findIndex((e) => e.id === id);
    if (i < 0) return null;
    const prev = EVENTS[i];
    EVENTS[i] = { ...prev, ...patch, id };
    const next = EVENTS[i];
    if (
      patch.projectId &&
      patch.projectId !== prev.projectId
    ) {
      this.ensureEventOnProjectDelivery(patch.projectId, next);
    }
    return next;
  },

  addEventCollaboratorSystem(eventId: string, systemId: SystemId) {
    const e = this.getEvent(eventId);
    if (!e) return null;
    const ids = [...new Set([...(e.collaboratorSystemIds ?? []), systemId])].filter(
      (id) => id !== e.ownerSystemId,
    );
    return this.updateEvent(eventId, { collaboratorSystemIds: ids });
  },

  addEventCollaboratorPerson(eventId: string, personId: string) {
    const e = this.getEvent(eventId);
    if (!e) return null;
    const ids = [...new Set([...(e.collaboratorPersonIds ?? []), personId])];
    return this.updateEvent(eventId, { collaboratorPersonIds: ids });
  },

  setEventLifecycle(
    eventId: string,
    phase: EventLifecyclePhase,
  ): { ok: boolean; reason?: string; event?: ChurchEvent } {
    const e = this.getEvent(eventId);
    if (!e) return { ok: false, reason: 'Event not found' };
    const patch: Partial<ChurchEvent> = { lifecyclePhase: phase };
    /* CLOSE = enter close-out; completion is explicit via completeEvent. */
    const event = this.updateEvent(eventId, patch);
    return event ? { ok: true, event } : { ok: false, reason: 'Update failed' };
  },

  submitEvent(
    id: string,
  ): { ok: boolean; reason?: string; event?: ChurchEvent } {
    const e = this.getEvent(id);
    if (!e) return { ok: false, reason: 'Event not found' };
    if (e.status !== 'DRAFT' && e.status !== 'PLANNED') {
      return { ok: false, reason: 'Only draft/planned events can be submitted' };
    }
    const status = e.beyondOwnerScope ? 'PENDING_APPROVAL' : 'CONFIRMED';
    const event = this.updateEvent(id, {
      status,
      lifecyclePhase: e.lifecyclePhase ?? 'PREPARE',
    });
    return event ? { ok: true, event } : { ok: false, reason: 'Update failed' };
  },

  publishEvent(id: string): ChurchEvent | null {
    return this.updateEvent(id, { visibility: 'CHURCH' });
  },

  eventApprovalChain(eventId: string) {
    const e = this.getEvent(eventId);
    return e ? eventApprovalChain(e) : [];
  },

  missingEventApprovals(eventId: string) {
    const e = this.getEvent(eventId);
    return e ? missingEventApprovals(e) : [];
  },

  approveEventLevel(input: {
    eventId: string;
    levelKey: string;
    personId: string;
    roles: SystemRole[];
    positions: Position[];
  }): { ok: boolean; reason?: string; event?: ChurchEvent } {
    const e = this.getEvent(input.eventId);
    if (!e) return { ok: false, reason: 'Event not found' };
    if (!e.beyondOwnerScope) {
      return { ok: false, reason: 'This event does not need upper approvals' };
    }
    const level = eventApprovalChain(e).find((l) => l.levelKey === input.levelKey);
    if (!level) return { ok: false, reason: 'Unknown approval level' };
    if (!canApproveEventLevel(level, input.roles, input.positions)) {
      return { ok: false, reason: `You cannot approve: ${level.label}` };
    }
    const approvals = [...(e.approvals ?? [])];
    if (approvals.some((a) => a.levelKey === level.levelKey)) {
      return { ok: false, reason: 'Already approved at this level' };
    }
    approvals.push({
      levelKey: level.levelKey,
      kind: level.kind,
      label: level.label,
      systemId: level.systemId,
      personId: input.personId,
      approvedAt: new Date().toISOString(),
    });
    const patch: Partial<ChurchEvent> = { approvals };
    const next = { ...e, approvals };
    if (eventApprovalsSatisfied(next)) {
      patch.status = 'CONFIRMED';
    } else {
      patch.status = 'PENDING_APPROVAL';
    }
    const event = this.updateEvent(e.id, patch);
    return event ? { ok: true, event } : { ok: false, reason: 'Update failed' };
  },

  completeEvent(id: string): ChurchEvent | null {
    const e = this.getEvent(id);
    if (!e) return null;
    const now = new Date().toISOString();
    for (const r of EVENT_REGISTRATIONS) {
      if (r.eventId === id && r.status === 'REGISTERED') {
        r.status = 'NO_SHOW';
        r.attendedAt = undefined;
      }
    }
    return this.updateEvent(id, {
      status: 'COMPLETED',
      lifecyclePhase: 'CLOSE',
      ...(e.endsAt ? {} : { endsAt: now }),
    });
  },

  cancelEvent(id: string): ChurchEvent | null {
    return this.updateEvent(id, { status: 'CANCELLED' });
  },

  listEventRegistrations(eventId: string): EventRegistration[] {
    this.expireStaleEventOffers(eventId);
    return EVENT_REGISTRATIONS.filter((r) => r.eventId === eventId);
  },

  /** Drop expired waitlist offers and free seats for FIFO promote. */
  expireStaleEventOffers(eventId: string): number {
    const now = Date.now();
    let n = 0;
    for (const r of EVENT_REGISTRATIONS) {
      if (
        r.eventId === eventId &&
        r.status === 'REGISTERED' &&
        r.offerExpiresAt &&
        new Date(r.offerExpiresAt).getTime() < now
      ) {
        r.status = 'CANCELLED';
        r.offerExpiresAt = undefined;
        n += 1;
      }
    }
    if (n > 0) this.promoteFromWaitlist(eventId);
    return n;
  },

  promoteFromWaitlist(
    eventId: string,
  ): { ok: boolean; registration?: EventRegistration; reason?: string } {
    const e = this.getEvent(eventId);
    if (!e) return { ok: false, reason: 'Event not found' };
    if (e.capacity == null) return { ok: false, reason: 'No capacity cap' };
    const seated = EVENT_REGISTRATIONS.filter(
      (r) =>
        r.eventId === eventId &&
        (r.status === 'REGISTERED' || r.status === 'ATTENDED'),
    );
    if (seated.length >= e.capacity) {
      return { ok: false, reason: 'No free seats' };
    }
    const waiters = EVENT_REGISTRATIONS.filter(
      (r) => r.eventId === eventId && r.status === 'WAITLIST',
    ).sort((a, b) => a.registeredOn.localeCompare(b.registeredOn));
    const next = waiters[0];
    if (!next) return { ok: false, reason: 'Waitlist empty' };
    const now = new Date();
    next.status = 'REGISTERED';
    next.promotedAt = now.toISOString();
    next.offerExpiresAt = new Date(
      now.getTime() + 48 * 3600 * 1000,
    ).toISOString();
    return { ok: true, registration: next };
  },

  cancelEventRegistration(input: {
    eventId: string;
    personId: string;
  }): {
    ok: boolean;
    reason?: string;
    registration?: EventRegistration;
    promoted?: EventRegistration;
  } {
    const e = this.getEvent(input.eventId);
    if (!e) return { ok: false, reason: 'Event not found' };
    const reg = EVENT_REGISTRATIONS.find(
      (r) =>
        r.eventId === input.eventId &&
        r.personId === input.personId &&
        r.status !== 'CANCELLED',
    );
    if (!reg) return { ok: false, reason: 'Registration not found' };
    if (reg.status === 'ATTENDED') {
      return { ok: false, reason: 'Already attended — cannot cancel' };
    }
    const wasSeated =
      reg.status === 'REGISTERED' || reg.status === 'WAITLIST';
    const freedSeat = reg.status === 'REGISTERED';
    reg.status = 'CANCELLED';
    reg.offerExpiresAt = undefined;
    let promoted: EventRegistration | undefined;
    if (freedSeat && wasSeated) {
      const p = this.promoteFromWaitlist(input.eventId);
      if (p.ok) promoted = p.registration;
    }
    return { ok: true, registration: reg, promoted };
  },

  registerForEvent(input: {
    eventId: string;
    personId: string;
  }): { ok: boolean; reason?: string; registration?: EventRegistration } {
    const e = this.getEvent(input.eventId);
    if (!e) return { ok: false, reason: 'Event not found' };
    if (e.status !== 'CONFIRMED' && e.status !== 'PLANNED') {
      return { ok: false, reason: 'Event not open for registration' };
    }
    if (registrationModeOf(e) !== 'REGISTRATION_REQUIRED') {
      return { ok: false, reason: 'Announcement-only — no registration' };
    }
    this.expireStaleEventOffers(input.eventId);
    const active = EVENT_REGISTRATIONS.filter(
      (r) =>
        r.eventId === input.eventId &&
        (r.status === 'REGISTERED' || r.status === 'ATTENDED'),
    );
    const already = EVENT_REGISTRATIONS.find(
      (r) =>
        r.eventId === input.eventId &&
        r.personId === input.personId &&
        r.status !== 'CANCELLED',
    );
    if (already && already.status !== 'CANCELLED') {
      return { ok: false, reason: 'Already registered' };
    }

    let status: EventRegistrationStatus = 'REGISTERED';
    if (e.capacity != null && active.length >= e.capacity) {
      status = 'WAITLIST';
    }
    if (already) {
      already.status = status;
      already.registeredOn = new Date().toISOString().slice(0, 10);
      already.offerExpiresAt = undefined;
      already.promotedAt = undefined;
      return { ok: true, registration: already };
    }
    const registration: EventRegistration = {
      id: nid('ereg'),
      eventId: input.eventId,
      personId: input.personId,
      status,
      registeredOn: new Date().toISOString().slice(0, 10),
    };
    EVENT_REGISTRATIONS.unshift(registration);
    return { ok: true, registration };
  },

  markEventAttendance(input: {
    eventId: string;
    personId: string;
    attended: boolean;
  }): { ok: boolean; reason?: string } {
    const e = this.getEvent(input.eventId);
    if (!e) return { ok: false, reason: 'Event not found' };
    const mode = registrationModeOf(e);
    let reg = EVENT_REGISTRATIONS.find(
      (r) =>
        r.eventId === input.eventId &&
        r.personId === input.personId &&
        r.status !== 'CANCELLED',
    );
    if (!reg) {
      if (mode === 'REGISTRATION_REQUIRED') {
        return { ok: false, reason: 'Not registered' };
      }
      reg = {
        id: nid('ereg'),
        eventId: input.eventId,
        personId: input.personId,
        status: 'REGISTERED',
        registeredOn: new Date().toISOString().slice(0, 10),
      };
      EVENT_REGISTRATIONS.unshift(reg);
    }
    reg.status = input.attended ? 'ATTENDED' : 'NO_SHOW';
    reg.attendedAt = input.attended ? new Date().toISOString() : undefined;
    return { ok: true };
  },

  /**
   * Option B after attend / event close — confirmable next steps only.
   */
  applyEventNextSteps(input: {
    personId: string;
    eventId: string;
    enrollProgramId?: string;
    addMembershipType?: MembershipType;
    membershipLabel?: string;
    updateBaptism?: { baptizedOn: string; place?: string };
    createFollowUpTask?: { title: string; ownerPersonId: string };
  }): { ok: boolean; reason?: string } {
    const e = this.getEvent(input.eventId);
    if (!e) return { ok: false, reason: 'Event not found' };
    const today = new Date().toISOString().slice(0, 10);

    peopleService.addTimelineEvent({
      personId: input.personId,
      at: today,
      kind: 'MINISTRY',
      title: `Event: ${e.name}`,
      detail: input.enrollProgramId
        ? 'Follow-up actions applied'
        : 'Attendance / participation noted',
    });

    if (input.enrollProgramId) {
      const r = this.enroll({
        programId: input.enrollProgramId,
        personId: input.personId,
      });
      if (!r.ok && r.reason !== 'Already enrolled') {
        return { ok: false, reason: r.reason };
      }
    }
    if (input.addMembershipType) {
      participationService.createMembership({
        personId: input.personId,
        type: input.addMembershipType,
        label: input.membershipLabel ?? input.addMembershipType,
      });
    }
    if (input.updateBaptism) {
      peopleService.saveBaptism({
        personId: input.personId,
        baptizedOn: input.updateBaptism.baptizedOn,
        place: input.updateBaptism.place,
      });
      peopleService.addTimelineEvent({
        personId: input.personId,
        at: input.updateBaptism.baptizedOn,
        kind: 'BAPTISM',
        title: 'Baptism recorded',
        detail: input.updateBaptism.place,
      });
    }
    if (input.createFollowUpTask) {
      this.createTask({
        title: input.createFollowUpTask.title,
        ownerPersonId: input.createFollowUpTask.ownerPersonId,
        contextType: 'EVENT',
        contextId: e.id,
        contextLabel: e.name,
        systemId: e.ownerSystemId,
        visibility: e.visibility,
      });
    }
    return { ok: true };
  },

  listProjects(filter?: {
    ownerSystemId?: SystemId;
    viewerSystemId?: SystemId;
    viewOpts?: ViewOpts;
  }): ChurchProject[] {
    return PROJECTS.filter((p) => {
      if (filter?.ownerSystemId && p.ownerSystemId !== filter.ownerSystemId) {
        return false;
      }
      if (filter?.viewerSystemId) {
        if (
          !missionItemVisibleTo(p, filter.viewerSystemId, {
            ...filter.viewOpts,
            shares: MISSION_SHARES,
            kind: 'PROJECT',
          })
        ) {
          return false;
        }
      }
      return true;
    });
  },

  projectsForSystem(viewerSystemId: SystemId, viewOpts?: ViewOpts) {
    return partitionMissionItems(
      this.listProjects({ viewerSystemId, viewOpts }),
      viewerSystemId,
      { ...viewOpts, shares: MISSION_SHARES, kind: 'PROJECT' },
    );
  },

  getProject(id: string): ChurchProject | null {
    return PROJECTS.find((p) => p.id === id) ?? null;
  },

  createProject(input: {
    name: string;
    description?: string;
    ownerSystemId: SystemId;
    visibility?: MissionVisibility;
    orgUnitId?: string;
    programId?: string;
    leadPersonId?: string;
    collaboratorSystemIds?: SystemId[];
    collaboratorPersonIds?: string[];
    beyondOwnerScope?: boolean;
    willSpend?: boolean;
    fundId?: string;
    createdByPersonId?: string;
    /** Church leadership may skip draft → ACTIVE (fast-track). */
    startActive?: boolean;
  }): { ok: boolean; reason?: string; project?: ChurchProject } {
    const willSpend = input.willSpend === true;
    if (willSpend && !input.fundId) {
      return {
        ok: false,
        reason: 'Fund required when project will spend (M1+M3+M4)',
      };
    }
    if (input.fundId && !FUNDS.find((f) => f.id === input.fundId)) {
      return { ok: false, reason: 'Unknown fund' };
    }
    if (input.programId && !this.getProgram(input.programId)) {
      return { ok: false, reason: 'Unknown parent programme' };
    }
    const beyond = input.beyondOwnerScope === true;
    const fast = input.startActive === true;
    const ownerOrg =
      input.orgUnitId ??
      systemsService.getById(input.ownerSystemId)?.orgUnitId;
    const collabSys = (input.collaboratorSystemIds ?? []).filter(
      (id) => id !== input.ownerSystemId,
    );
    const collabPeople = [...new Set(input.collaboratorPersonIds ?? [])];
    let status: ChurchProject['status'] = 'DRAFT';
    if (fast) status = 'ACTIVE';
    /* Beyond-scope also starts DRAFT — submit moves to PENDING_APPROVAL. */
    const p: ChurchProject = {
      id: nid('proj'),
      name: input.name,
      description: input.description,
      ownerSystemId: input.ownerSystemId,
      orgUnitId: ownerOrg,
      programId: input.programId,
      visibility: input.visibility ?? 'MINISTRY_PRIVATE',
      status,
      startDate: status === 'ACTIVE' ? new Date().toISOString().slice(0, 10) : undefined,
      leadPersonId: input.leadPersonId || undefined,
      collaboratorSystemIds: collabSys.length ? collabSys : undefined,
      collaboratorPersonIds: collabPeople.length ? collabPeople : undefined,
      beyondOwnerScope: beyond,
      approvals: [],
      willSpend,
      fundId: willSpend ? input.fundId : input.fundId || undefined,
      createdByPersonId: input.createdByPersonId,
    };
    PROJECTS.unshift(p);
    scheduleLocalDomainPersist();
    return { ok: true, project: p };
  },

  submitProjectForApproval(
    id: string,
  ): { ok: boolean; reason?: string; project?: ChurchProject } {
    const p = this.getProject(id);
    if (!p) return { ok: false, reason: 'Project not found' };
    if (p.status !== 'DRAFT') {
      return { ok: false, reason: 'Only DRAFT projects can be submitted' };
    }
    const project = this.updateProject(id, { status: 'PENDING_APPROVAL' });
    return project
      ? { ok: true, project }
      : { ok: false, reason: 'Update failed' };
  },

  /**
   * In-scope (or after chain) blessing → PLANNED (setup), not ACTIVE.
   * Beyond-scope uses approveProjectLevel until chain complete.
   */
  approveProject(
    id: string,
    _approverPersonId: string,
    roles: SystemRole[],
  ): { ok: boolean; reason?: string; project?: ChurchProject } {
    if (!isChurchLeader(roles)) {
      return {
        ok: false,
        reason: 'Church Leader must approve',
      };
    }
    const p = this.getProject(id);
    if (!p) return { ok: false, reason: 'Project not found' };
    if (p.status !== 'PENDING_APPROVAL') {
      return { ok: false, reason: 'Not awaiting approval' };
    }
    if (p.beyondOwnerScope) {
      return {
        ok: false,
        reason: 'Use the approval chain for beyond-scope projects',
      };
    }
    const project = this.updateProject(id, { status: 'PLANNED' });
    return project
      ? { ok: true, project }
      : { ok: false, reason: 'Update failed' };
  },

  /**
   * PLANNED (setup) → ACTIVE when ready to run.
   * Spend gate: willSpend && fundingGap > 0 requires forceSpendGap + reason.
   */
  startProject(
    id: string,
    opts?: { forceSpendGap?: boolean; forceReason?: string },
  ): {
    ok: boolean;
    reason?: string;
    project?: ChurchProject;
    gap?: number;
    openRequired?: number;
  } {
    const p = this.getProject(id);
    if (!p) return { ok: false, reason: 'Project not found' };
    if (p.status !== 'PLANNED') {
      return { ok: false, reason: 'Only PLANNED projects can start running' };
    }
    const gap =
      (Number(p.plannedCost) || 0) -
      (p.fundingPlan ?? [])
        .filter((f) => f.status === 'CONFIRMED')
        .reduce((s, f) => s + (Number(f.amount) || 0), 0);
    if (p.willSpend && gap > 0) {
      if (!opts?.forceSpendGap) {
        return {
          ok: false,
          reason: `Funding gap ${Math.round(gap)} RWF — confirm funding or force start with a reason`,
          gap,
        };
      }
      const reason = (opts.forceReason ?? '').trim();
      if (reason.length < 8) {
        return {
          ok: false,
          reason: 'Force start requires a reason (at least 8 characters)',
          gap,
        };
      }
    }
    const project = this.updateProject(id, {
      status: 'ACTIVE',
      startDate: p.startDate ?? new Date().toISOString().slice(0, 10),
      ...(opts?.forceSpendGap && gap > 0
        ? {
            outcomeNote: [
              p.outcomeNote,
              `Spend-gap override: ${opts.forceReason!.trim()}`,
            ]
              .filter(Boolean)
              .join(' · '),
          }
        : {}),
    });
    if (!project) return { ok: false, reason: 'Update failed' };
    const openReq = requiredDeliveryOpen(p).length;
    return {
      ok: true,
      project,
      gap: gap > 0 ? gap : undefined,
      openRequired: openReq > 0 ? openReq : undefined,
    };
  },

  projectsForProgram(programId: string): ChurchProject[] {
    return PROJECTS.filter((p) => p.programId === programId);
  },

  eventsForProject(projectId: string): ChurchEvent[] {
    return EVENTS.filter((e) => e.projectId === projectId);
  },

  /**
   * Confirmed gift/donation → fundingPlan CONFIRMED on tagged programme/project.
   */
  applyDesignatedGift(input: {
    amount: number;
    label: string;
    fundId: string;
    donationId: string;
    personId: string;
    programId?: string;
    projectId?: string;
    note?: string;
  }): { ok: boolean; reason?: string; warnings?: string[] } {
    if (!input.programId && !input.projectId) {
      return { ok: true };
    }
    if (!FUNDS.find((f) => f.id === input.fundId)) {
      return { ok: false, reason: 'Unknown fund' };
    }
    const warnings: string[] = [];
    const apply = (kind: MissionStewardKind, id: string) => {
      const obj =
        kind === 'PROGRAM' ? this.getProgram(id) : this.getProject(id);
      if (!obj) {
        warnings.push(`${kind} ${id} not found`);
        return;
      }
      if (
        kind === 'PROJECT' &&
        'fundId' in obj &&
        obj.fundId &&
        obj.fundId !== input.fundId
      ) {
        warnings.push(
          `Gift fund differs from project vault (${obj.fundId}) — tagged anyway`,
        );
      }
      this.recordConfirmedAllocation(kind, id, {
        sourceType: 'DESIGNATED_GIFT',
        label: input.label,
        amount: input.amount,
        fundId: input.fundId,
        personId: input.personId,
        donationId: input.donationId,
        note: input.note,
      });
    };
    if (input.projectId) apply('PROJECT', input.projectId);
    if (input.programId) apply('PROGRAM', input.programId);
    return { ok: true, warnings: warnings.length ? warnings : undefined };
  },

  updateProject(
    id: string,
    patch: Partial<ChurchProject>,
  ): ChurchProject | null {
    const i = PROJECTS.findIndex((p) => p.id === id);
    if (i < 0) return null;
    const prev = PROJECTS[i];
    if (prev.closeout && patch.closeout && patch.closeout !== prev.closeout) {
      const { closeout: _ignored, ...rest } = patch;
      PROJECTS[i] = { ...prev, ...rest, id, closeout: prev.closeout };
      return PROJECTS[i];
    }
    PROJECTS[i] = { ...prev, ...patch, id };
    return PROJECTS[i];
  },

  publishProject(id: string): ChurchProject | null {
    return this.updateProject(id, { visibility: 'CHURCH' });
  },

  projectApprovalChain(projectId: string) {
    const p = this.getProject(projectId);
    return p ? scopeApprovalChain(p) : [];
  },

  missingProjectApprovals(projectId: string) {
    const p = this.getProject(projectId);
    return p ? missingScopeApprovals(p) : [];
  },

  approveProjectLevel(input: {
    projectId: string;
    levelKey: string;
    personId: string;
    roles: SystemRole[];
    positions: Position[];
  }): { ok: boolean; reason?: string; project?: ChurchProject } {
    const p = this.getProject(input.projectId);
    if (!p) return { ok: false, reason: 'Project not found' };
    if (!p.beyondOwnerScope) {
      return { ok: false, reason: 'This project does not need upper approvals' };
    }
    const level = scopeApprovalChain(p).find(
      (l) => l.levelKey === input.levelKey,
    );
    if (!level) return { ok: false, reason: 'Unknown approval level' };
    if (!canApproveScopeLevel(level, input.roles, input.positions)) {
      return { ok: false, reason: `You cannot approve: ${level.label}` };
    }
    const approvals = [...(p.approvals ?? [])];
    if (approvals.some((a) => a.levelKey === level.levelKey)) {
      return { ok: false, reason: 'Already approved at this level' };
    }
    approvals.push({
      levelKey: level.levelKey,
      kind: level.kind,
      label: level.label,
      systemId: level.systemId,
      personId: input.personId,
      approvedAt: new Date().toISOString(),
    });
    const next = { ...p, approvals };
    const patch: Partial<ChurchProject> = { approvals };
    if (scopeApprovalsSatisfied(next)) {
      patch.status = 'PLANNED';
    } else {
      patch.status = 'PENDING_APPROVAL';
    }
    const project = this.updateProject(p.id, patch);
    return project
      ? { ok: true, project }
      : { ok: false, reason: 'Update failed' };
  },

  addProjectCollaboratorSystem(
    projectId: string,
    systemId: SystemId,
  ): ChurchProject | null {
    const p = this.getProject(projectId);
    if (!p || p.ownerSystemId === systemId) return p;
    const ids = [...new Set([...(p.collaboratorSystemIds ?? []), systemId])];
    return this.updateProject(projectId, { collaboratorSystemIds: ids });
  },

  addProjectCollaboratorPerson(
    projectId: string,
    personId: string,
  ): ChurchProject | null {
    const p = this.getProject(projectId);
    if (!p) return null;
    const ids = [...new Set([...(p.collaboratorPersonIds ?? []), personId])];
    return this.updateProject(projectId, { collaboratorPersonIds: ids });
  },

  openTasksForProject(projectId: string): WorkTask[] {
    return TASKS.filter(
      (t) =>
        t.contextType === 'PROJECT' &&
        t.contextId === projectId &&
        (t.status === 'TODO' || t.status === 'IN_PROGRESS'),
    );
  },

  /** ACTIVE → CLOSING checklist phase before DONE. */
  beginCloseProject(
    id: string,
  ): { ok: boolean; reason?: string; project?: ChurchProject } {
    const p = this.getProject(id);
    if (!p) return { ok: false, reason: 'Project not found' };
    if (p.status === 'CLOSING') return { ok: true, project: p };
    if (p.status !== 'ACTIVE' && p.status !== 'PAUSED') {
      return {
        ok: false,
        reason: 'Only ACTIVE/PAUSED projects can enter CLOSING',
      };
    }
    const project = this.updateProject(id, { status: 'CLOSING' });
    return project
      ? { ok: true, project }
      : { ok: false, reason: 'Update failed' };
  },

  abandonCloseProject(
    id: string,
  ): { ok: boolean; reason?: string; project?: ChurchProject } {
    const p = this.getProject(id);
    if (!p) return { ok: false, reason: 'Project not found' };
    if (p.status !== 'CLOSING') {
      return { ok: false, reason: 'Not in CLOSING' };
    }
    const project = this.updateProject(id, { status: 'ACTIVE' });
    return project
      ? { ok: true, project }
      : { ok: false, reason: 'Update failed' };
  },

  /**
   * Close project with P0 stewardship gates + open-task soft-block.
   * Must be CLOSING (ACTIVE auto-enters CLOSING first).
   */
  completeProject(
    id: string,
    opts?: {
      outcomeNote?: string;
      forceClose?: boolean;
      forceReason?: string;
      usedCost?: number;
      closeout?: Omit<MissionCloseout, 'closedAt' | 'closedByPersonId'> & {
        closedByPersonId: string;
      };
    },
  ): {
    ok: boolean;
    reason?: string;
    project?: ChurchProject;
    openTasks?: number;
  } {
    const p = this.getProject(id);
    if (!p) return { ok: false, reason: 'Project not found' };
    if (p.status === 'DONE' || p.status === 'CANCELLED') {
      return { ok: false, reason: 'Already closed' };
    }
    if (p.status === 'PENDING_APPROVAL' || p.status === 'DRAFT') {
      return { ok: false, reason: 'Still pending approval' };
    }
    if (p.status === 'PLANNED') {
      return {
        ok: false,
        reason: 'Still in SETUP — start running before close-out',
      };
    }
    if (p.status === 'ACTIVE' || p.status === 'PAUSED') {
      const entered = this.beginCloseProject(id);
      if (!entered.ok) return entered;
    }
    const live = this.getProject(id);
    if (!live || live.status !== 'CLOSING') {
      return {
        ok: false,
        reason: 'Begin close-out first (status must be CLOSING)',
      };
    }
    if (!opts?.closeout) {
      return {
        ok: false,
        reason: 'Close-out required (work + money summary and leftover)',
      };
    }
    const openAdv = openAdvances(live);
    const open = this.openTasksForProject(id);
    const needsForce =
      !deliveryReadyToClose(live) || openAdv.length > 0 || open.length > 0;
    if (needsForce && !opts.forceClose) {
      if (!deliveryReadyToClose(live)) {
        const openDel = requiredDeliveryOpen(live);
        return {
          ok: false,
          reason: `${openDel.length} required delivery item(s) still open — finish, waive, or force`,
        };
      }
      if (openAdv.length > 0) {
        return {
          ok: false,
          reason: `${openAdv.length} open advance(s) must be retired — or force close`,
        };
      }
      return {
        ok: false,
        reason: `${open.length} open task(s) — finish/cancel them or force close`,
        openTasks: open.length,
      };
    }
    if (opts.forceClose && needsForce) {
      const reason = (opts.forceReason ?? opts.closeout.forceReason ?? '').trim();
      if (reason.length < 8) {
        return {
          ok: false,
          reason: 'Force close requires a reason (at least 8 characters)',
        };
      }
    }
    const used =
      opts.usedCost !== undefined
        ? opts.usedCost
        : live.usedCost !== undefined
          ? live.usedCost
          : 0;
    const forceReason =
      opts.forceClose && needsForce
        ? (opts.forceReason ?? opts.closeout.forceReason ?? '').trim()
        : undefined;
    const closeout: MissionCloseout = {
      ...opts.closeout,
      forceReason,
      closedAt: new Date().toISOString(),
      plannedCostSnapshot: live.plannedCost,
      usedCostSnapshot: used,
      confirmedFundingSnapshot: (live.fundingPlan ?? [])
        .filter((f) => f.status === 'CONFIRMED')
        .reduce((s, f) => s + (Number(f.amount) || 0), 0),
    };
    const project = this.updateProject(id, {
      status: 'DONE',
      endDate: new Date().toISOString().slice(0, 10),
      outcomeNote: opts?.outcomeNote?.trim() || undefined,
      usedCost: used,
      closeout,
    });
    return project
      ? { ok: true, project }
      : { ok: false, reason: 'Update failed' };
  },

  cancelProject(
    id: string,
    outcomeNote?: string,
  ): { ok: boolean; reason?: string; project?: ChurchProject } {
    const p = this.getProject(id);
    if (!p) return { ok: false, reason: 'Project not found' };
    if (p.status === 'DONE' || p.status === 'CANCELLED') {
      return { ok: false, reason: 'Already closed' };
    }
    const project = this.updateProject(id, {
      status: 'CANCELLED',
      endDate: new Date().toISOString().slice(0, 10),
      outcomeNote: outcomeNote?.trim() || undefined,
    });
    return project
      ? { ok: true, project }
      : { ok: false, reason: 'Update failed' };
  },

  /**
   * Link an event to a project and ensure a PLANNED EVENT delivery row exists.
   */
  linkEventToProject(
    eventId: string,
    projectId: string | null,
  ): { ok: boolean; reason?: string; event?: ChurchEvent } {
    const ev = this.getEvent(eventId);
    if (!ev) return { ok: false, reason: 'Event not found' };
    if (!projectId) {
      const cleared = this.updateEvent(eventId, { projectId: undefined });
      return cleared
        ? { ok: true, event: cleared }
        : { ok: false, reason: 'Update failed' };
    }
    const project = this.getProject(projectId);
    if (!project) return { ok: false, reason: 'Project not found' };
    const updated = this.updateEvent(eventId, { projectId });
    if (!updated) return { ok: false, reason: 'Update failed' };
    this.ensureEventOnProjectDelivery(projectId, updated);
    return { ok: true, event: updated };
  },

  ensureEventOnProjectDelivery(projectId: string, event: ChurchEvent) {
    const s = this.stewardshipOf('PROJECT', projectId);
    if (!s) return;
    const items = s.deliveryItems ?? [];
    if (items.some((d) => d.eventId === event.id)) return;
    const sameTitle = items.find(
      (d) =>
        d.kind === 'EVENT' &&
        d.title.trim().toLowerCase() === event.name.trim().toLowerCase() &&
        !d.eventId,
    );
    if (sameTitle) {
      const next = items.map((d) =>
        d.id === sameTitle.id ? { ...d, eventId: event.id } : d,
      );
      this.patchStewardship('PROJECT', projectId, { deliveryItems: next });
      return;
    }
    this.addDeliveryItem('PROJECT', projectId, {
      kind: 'EVENT',
      tier: 'PLANNED',
      title: event.name,
      dueDate: event.startsAt.slice(0, 10),
      eventId: event.id,
    });
  },

  listTasks(filter?: {
    ownerPersonId?: string;
    involvedPersonId?: string;
    systemId?: SystemId;
    viewerSystemId?: SystemId;
    viewOpts?: ViewOpts;
  }) {
    return TASKS.filter((t) => {
      if (filter?.ownerPersonId && t.ownerPersonId !== filter.ownerPersonId) {
        return false;
      }
      if (filter?.involvedPersonId) {
        const id = filter.involvedPersonId;
        const involved =
          t.ownerPersonId === id ||
          (t.helperPersonIds ?? []).includes(id);
        if (!involved) return false;
      }
      if (filter?.systemId && t.systemId !== filter.systemId) return false;
      if (filter?.viewerSystemId) {
        if (
          !missionItemVisibleTo(
            { ...t, ownerSystemId: t.systemId },
            filter.viewerSystemId,
            {
              ...filter.viewOpts,
              shares: MISSION_SHARES,
              kind: 'TASK',
            },
          )
        ) {
          return false;
        }
      }
      return true;
    });
  },

  tasksForSystem(viewerSystemId: SystemId, viewOpts?: ViewOpts) {
    const visible = this.listTasks({ viewerSystemId, viewOpts }).map((t) => ({
      ...t,
      ownerSystemId: t.systemId,
    }));
    return partitionMissionItems(visible, viewerSystemId, {
      ...viewOpts,
      shares: MISSION_SHARES,
      kind: 'TASK',
    });
  },

  getTask(id: string): WorkTask | null {
    return TASKS.find((t) => t.id === id) ?? null;
  },

  createTask(input: {
    title: string;
    description?: string;
    ownerPersonId: string;
    helperPersonIds?: string[];
    accountablePersonId?: string;
    watcherPersonIds?: string[];
    dependsOn?: string[];
    createdByPersonId?: string;
    systemId: SystemId;
    visibility?: MissionVisibility;
    contextType?: WorkTask['contextType'];
    contextId?: string;
    contextLabel?: string;
    dueDate?: string;
    grantsSystemAccess?: boolean;
  }): WorkTask {
    const helpers = (input.helperPersonIds ?? []).filter(
      (id) => id && id !== input.ownerPersonId,
    );
    const watchers = (input.watcherPersonIds ?? []).filter(
      (id) =>
        id &&
        id !== input.ownerPersonId &&
        id !== input.accountablePersonId &&
        !helpers.includes(id),
    );
    const t: WorkTask = {
      id: nid('task'),
      title: input.title,
      description: input.description,
      ownerPersonId: input.ownerPersonId,
      helperPersonIds: helpers.length ? helpers : undefined,
      accountablePersonId: input.accountablePersonId || undefined,
      watcherPersonIds: watchers.length ? watchers : undefined,
      dependsOn: input.dependsOn?.length ? [...input.dependsOn] : undefined,
      createdByPersonId: input.createdByPersonId,
      contextType: input.contextType ?? 'NONE',
      contextId: input.contextId,
      contextLabel: input.contextLabel,
      systemId: input.systemId,
      visibility: input.visibility ?? 'MINISTRY_PRIVATE',
      grantsSystemAccess: input.grantsSystemAccess === true,
      status: 'TODO',
      dueDate: input.dueDate,
      startDate: new Date().toISOString().slice(0, 10),
    };
    TASKS.unshift(t);
    scheduleLocalDomainPersist();
    return t;
  },

  updateTask(id: string, patch: Partial<WorkTask>): WorkTask | null {
    const i = TASKS.findIndex((t) => t.id === id);
    if (i < 0) return null;
    TASKS[i] = { ...TASKS[i], ...patch, id };
    scheduleLocalDomainPersist();
    return TASKS[i];
  },

  publishTask(id: string): WorkTask | null {
    return this.updateTask(id, { visibility: 'CHURCH' });
  },

  addTaskHelper(taskId: string, personId: string): WorkTask | null {
    const t = this.getTask(taskId);
    if (!t) return null;
    if (t.ownerPersonId === personId) return t;
    if (t.status === 'DONE' || t.status === 'CANCELLED') return t;
    const helpers = [...new Set([...(t.helperPersonIds ?? []), personId])];
    return this.updateTask(taskId, { helperPersonIds: helpers });
  },

  removeTaskHelper(taskId: string, personId: string): WorkTask | null {
    const t = this.getTask(taskId);
    if (!t) return null;
    const helpers = (t.helperPersonIds ?? []).filter((id) => id !== personId);
    return this.updateTask(taskId, {
      helperPersonIds: helpers.length ? helpers : undefined,
    });
  },

  startTask(id: string): WorkTask | null {
    const t = this.getTask(id);
    if (!t || t.status !== 'TODO') return null;
    const blocked = this.openDependencyTitles(id);
    if (blocked.length) {
      /* Soft gate: allow start but caller can surface warning via peek. */
    }
    return this.updateTask(id, { status: 'IN_PROGRESS' });
  },

  /** Titles of incomplete dependsOn tasks (soft critical). */
  openDependencyTitles(taskId: string): string[] {
    const t = this.getTask(taskId);
    if (!t?.dependsOn?.length) return [];
    return t.dependsOn
      .map((id) => this.getTask(id))
      .filter(
        (d): d is WorkTask =>
          !!d && d.status !== 'DONE' && d.status !== 'CANCELLED',
      )
      .map((d) => d.title);
  },

  isSoftCritical(taskId: string): boolean {
    return this.openDependencyTitles(taskId).length > 0;
  },

  /** Restore a just-completed task (undo toast). */
  reopenTask(
    id: string,
    prior: {
      status: WorkTask['status'];
      endDate?: string;
      outcomeNote?: string;
      grantsSystemAccess?: boolean;
      accessRevokedAt?: string;
    },
  ): WorkTask | null {
    const t = this.getTask(id);
    if (!t || t.status !== 'DONE') return null;
    return this.updateTask(id, {
      status: prior.status === 'DONE' ? 'IN_PROGRESS' : prior.status,
      endDate: prior.endDate,
      outcomeNote: prior.outcomeNote,
      grantsSystemAccess: prior.grantsSystemAccess ?? false,
      accessRevokedAt: prior.accessRevokedAt,
    });
  },

  /**
   * Option A — record only: status/dates + revoke temp access. No guided menu.
   */
  completeTask(
    id: string,
    outcomeNote?: string,
  ): { ok: boolean; reason?: string; task?: WorkTask } {
    const t = this.getTask(id);
    if (!t) return { ok: false, reason: 'Task not found' };
    if (t.status === 'DONE' || t.status === 'CANCELLED') {
      return { ok: false, reason: 'Already closed' };
    }
    const patch: Partial<WorkTask> = {
      status: 'DONE',
      endDate: new Date().toISOString().slice(0, 10),
      outcomeNote: outcomeNote?.trim() || undefined,
    };
    if (t.grantsSystemAccess) {
      patch.grantsSystemAccess = false;
      patch.accessRevokedAt = new Date().toISOString();
    }
    const task = this.updateTask(id, patch);
    return task ? { ok: true, task } : { ok: false, reason: 'Update failed' };
  },

  cancelTask(
    id: string,
    outcomeNote?: string,
  ): { ok: boolean; reason?: string; task?: WorkTask } {
    const t = this.getTask(id);
    if (!t) return { ok: false, reason: 'Task not found' };
    if (t.status === 'DONE' || t.status === 'CANCELLED') {
      return { ok: false, reason: 'Already closed' };
    }
    const patch: Partial<WorkTask> = {
      status: 'CANCELLED',
      endDate: new Date().toISOString().slice(0, 10),
      outcomeNote: outcomeNote?.trim() || undefined,
    };
    if (t.grantsSystemAccess) {
      patch.grantsSystemAccess = false;
      patch.accessRevokedAt = new Date().toISOString();
    }
    const task = this.updateTask(id, patch);
    return task ? { ok: true, task } : { ok: false, reason: 'Update failed' };
  },

  activeTasksFor(personId: string, now = new Date()): WorkTask[] {
    return TASKS.filter((t) => {
      const involved =
        t.ownerPersonId === personId ||
        (t.helperPersonIds ?? []).includes(personId);
      return involved && isTaskActive(t, now);
    });
  },

  calendar(viewerSystemId: SystemId = 'sys-main', viewOpts?: ViewOpts) {
    const programs = this.listPrograms({ viewerSystemId, viewOpts });
    const map = new Map(programs.map((p) => [p.id, p]));
    return calendarItems(
      this.listActivities({ viewerSystemId, viewOpts }),
      this.listEvents({ viewerSystemId, viewOpts }),
      map,
    );
  },

  /* ─── P0 stewardship spine (money + delivery) ─── */

  stewardshipOf(
    kind: MissionStewardKind,
    id: string,
  ): MissionStewardship | null {
    const obj =
      kind === 'PROGRAM' ? this.getProgram(id) : this.getProject(id);
    if (!obj) return null;
    return {
      plannedCost: obj.plannedCost,
      budgetLines: obj.budgetLines,
      fundingPlan: obj.fundingPlan,
      usedCost: obj.usedCost,
      deliveryItems: obj.deliveryItems,
      closeout: obj.closeout,
      advances: obj.advances,
      inKind: obj.inKind,
      envelopePeriod: obj.envelopePeriod,
      phaseRenewals: obj.phaseRenewals,
    };
  },

  patchStewardship(
    kind: MissionStewardKind,
    id: string,
    patch: Partial<MissionStewardship>,
  ): { ok: boolean; reason?: string } {
    const existing = this.stewardshipOf(kind, id);
    if (!existing) {
      return {
        ok: false,
        reason: kind === 'PROGRAM' ? 'Program not found' : 'Project not found',
      };
    }
    if (existing.closeout && patch.closeout) {
      return { ok: false, reason: 'Close-out is immutable' };
    }
    if (kind === 'PROGRAM') {
      const p = this.updateProgram(id, patch);
      return p ? { ok: true } : { ok: false, reason: 'Program not found' };
    }
    const p = this.updateProject(id, patch);
    return p ? { ok: true } : { ok: false, reason: 'Project not found' };
  },

  setPlannedCost(
    kind: MissionStewardKind,
    id: string,
    plannedCost: number,
    budgetLines?: MissionBudgetLine[],
  ) {
    const lines = budgetLines?.slice(0, 8);
    return this.patchStewardship(kind, id, {
      plannedCost: Math.max(0, Math.round(plannedCost)),
      ...(lines ? { budgetLines: lines } : {}),
    });
  },

  setUsedCost(kind: MissionStewardKind, id: string, usedCost: number) {
    return this.patchStewardship(kind, id, {
      usedCost: Math.max(0, Math.round(usedCost)),
    });
  },

  addFundingSource(
    kind: MissionStewardKind,
    id: string,
    input: {
      sourceType: FundingSourceType;
      label: string;
      amount: number;
      status?: FundingSourceStatus;
      fundId?: string;
      note?: string;
    },
  ): { ok: boolean; reason?: string; source?: MissionFundingSource } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    const status = input.status ?? 'INTENDED';
    if (status === 'CONFIRMED' && !input.fundId) {
      return { ok: false, reason: 'Confirmed funding needs a fund' };
    }
    if (input.fundId && !FUNDS.find((f) => f.id === input.fundId)) {
      return { ok: false, reason: 'Unknown fund' };
    }
    const source: MissionFundingSource = {
      id: nid('fs'),
      sourceType: input.sourceType,
      label: input.label.trim() || input.sourceType,
      amount: Math.max(0, Math.round(input.amount)),
      status,
      fundId: input.fundId,
      note: input.note?.trim() || undefined,
      confirmedAt:
        status === 'CONFIRMED' ? new Date().toISOString() : undefined,
    };
    const fundingPlan = [...(s.fundingPlan ?? []), source];
    const r = this.patchStewardship(kind, id, { fundingPlan });
    return r.ok ? { ok: true, source } : r;
  },

  /** Manual confirm allocation (P0 S5) — intended → confirmed with fund. */
  confirmFundingSource(
    kind: MissionStewardKind,
    id: string,
    sourceId: string,
    input: { fundId: string; personId: string; note?: string },
  ): { ok: boolean; reason?: string } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    if (!FUNDS.find((f) => f.id === input.fundId)) {
      return { ok: false, reason: 'Unknown fund' };
    }
    const fundingPlan = (s.fundingPlan ?? []).map((f) => {
      if (f.id !== sourceId) return f;
      return {
        ...f,
        status: 'CONFIRMED' as const,
        fundId: input.fundId,
        confirmedAt: new Date().toISOString(),
        confirmedByPersonId: input.personId,
        note: input.note?.trim() || f.note,
      };
    });
    if (!(s.fundingPlan ?? []).some((f) => f.id === sourceId)) {
      return { ok: false, reason: 'Source not found' };
    }
    return this.patchStewardship(kind, id, { fundingPlan });
  },

  /** Record a confirmed allocation in one step (no prior intended row). */
  recordConfirmedAllocation(
    kind: MissionStewardKind,
    id: string,
    input: {
      sourceType: FundingSourceType;
      label: string;
      amount: number;
      fundId: string;
      personId: string;
      note?: string;
      donationId?: string;
    },
  ): { ok: boolean; reason?: string; source?: MissionFundingSource } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    if (!FUNDS.find((f) => f.id === input.fundId)) {
      return { ok: false, reason: 'Unknown fund' };
    }
    const source: MissionFundingSource = {
      id: nid('fs'),
      sourceType: input.sourceType,
      label: input.label.trim() || 'Confirmed allocation',
      amount: Math.max(0, Math.round(input.amount)),
      status: 'CONFIRMED',
      fundId: input.fundId,
      donationId: input.donationId,
      note: input.note?.trim() || undefined,
      confirmedAt: new Date().toISOString(),
      confirmedByPersonId: input.personId,
    };
    const fundingPlan = [...(s.fundingPlan ?? []), source];
    const r = this.patchStewardship(kind, id, { fundingPlan });
    return r.ok ? { ok: true, source } : r;
  },

  addDeliveryItem(
    kind: MissionStewardKind,
    id: string,
    input: {
      kind: DeliveryItemKind;
      tier: DeliveryItemTier;
      title: string;
      ownerPersonId?: string;
      dueDate?: string;
      eventId?: string;
      activityId?: string;
    },
  ): { ok: boolean; reason?: string; item?: MissionDeliveryItem } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    const item: MissionDeliveryItem = {
      id: nid('del'),
      kind: input.kind,
      tier: input.tier,
      title: input.title.trim(),
      status: 'TODO',
      ownerPersonId: input.ownerPersonId,
      dueDate: input.dueDate,
      eventId: input.eventId,
      activityId: input.activityId,
    };
    if (!item.title) return { ok: false, reason: 'Title required' };
    const deliveryItems = [...(s.deliveryItems ?? []), item];
    const r = this.patchStewardship(kind, id, { deliveryItems });
    return r.ok ? { ok: true, item } : r;
  },

  setDeliveryItemStatus(
    kind: MissionStewardKind,
    id: string,
    itemId: string,
    status: DeliveryItemStatus,
    opts?: {
      waiveNote?: string;
      waivedByPersonId?: string;
    },
  ): { ok: boolean; reason?: string } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    const items = s.deliveryItems ?? [];
    const idx = items.findIndex((d) => d.id === itemId);
    if (idx < 0) return { ok: false, reason: 'Delivery item not found' };
    if (status === 'WAIVED' && !opts?.waiveNote?.trim()) {
      return { ok: false, reason: 'Waive requires a reason' };
    }
    const next = [...items];
    next[idx] = {
      ...next[idx],
      status,
      waiveNote:
        status === 'WAIVED' ? opts?.waiveNote?.trim() : next[idx].waiveNote,
      waivedByPersonId:
        status === 'WAIVED' ? opts?.waivedByPersonId : next[idx].waivedByPersonId,
      waivedAt:
        status === 'WAIVED' ? new Date().toISOString() : next[idx].waivedAt,
    };
    return this.patchStewardship(kind, id, { deliveryItems: next });
  },

  promoteDeliveryItem(
    kind: MissionStewardKind,
    id: string,
    itemId: string,
  ): { ok: boolean; reason?: string } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    const items = s.deliveryItems ?? [];
    const idx = items.findIndex((d) => d.id === itemId);
    if (idx < 0) return { ok: false, reason: 'Delivery item not found' };
    if (items[idx].tier !== 'POSSIBLE') {
      return { ok: false, reason: 'Only POSSIBLE items can be promoted' };
    }
    const next = [...items];
    next[idx] = { ...next[idx], tier: 'PLANNED' };
    return this.patchStewardship(kind, id, { deliveryItems: next });
  },

  /* ─── P2: advances, budget lines, in-kind, renew, pause, transfer tag ─── */

  pauseProject(id: string): { ok: boolean; reason?: string; project?: ChurchProject } {
    const p = this.getProject(id);
    if (!p) return { ok: false, reason: 'Project not found' };
    if (p.status !== 'ACTIVE') {
      return { ok: false, reason: 'Only ACTIVE projects can pause' };
    }
    const project = this.updateProject(id, { status: 'PAUSED' });
    return project ? { ok: true, project } : { ok: false, reason: 'Update failed' };
  },

  resumeProject(id: string): { ok: boolean; reason?: string; project?: ChurchProject } {
    const p = this.getProject(id);
    if (!p) return { ok: false, reason: 'Project not found' };
    if (p.status !== 'PAUSED') {
      return { ok: false, reason: 'Only PAUSED projects can resume' };
    }
    const project = this.updateProject(id, { status: 'ACTIVE' });
    return project ? { ok: true, project } : { ok: false, reason: 'Update failed' };
  },

  upsertBudgetLine(
    kind: MissionStewardKind,
    id: string,
    input: { id?: string; label: string; plannedAmount: number; personId: string },
  ): { ok: boolean; reason?: string } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    const lines = [...(s.budgetLines ?? [])];
    if (input.id) {
      const idx = lines.findIndex((l) => l.id === input.id);
      if (idx < 0) return { ok: false, reason: 'Budget line not found' };
      if (lines[idx].frozen) {
        return { ok: false, reason: 'Line is frozen — unfreeze to amend' };
      }
      lines[idx] = {
        ...lines[idx],
        label: input.label.trim(),
        plannedAmount: Math.max(0, Math.round(input.plannedAmount)),
        amendNote: `Amended to ${Math.round(input.plannedAmount)}`,
        amendedAt: new Date().toISOString(),
        amendedByPersonId: input.personId,
      };
    } else {
      if (lines.length >= 8) {
        return { ok: false, reason: 'Max 8 budget lines' };
      }
      lines.push({
        id: nid('bl'),
        label: input.label.trim(),
        plannedAmount: Math.max(0, Math.round(input.plannedAmount)),
      });
    }
    const plannedCost = lines.reduce((sum, l) => sum + l.plannedAmount, 0);
    return this.patchStewardship(kind, id, { budgetLines: lines, plannedCost });
  },

  setBudgetLineFrozen(
    kind: MissionStewardKind,
    id: string,
    lineId: string,
    frozen: boolean,
    opts?: { amendNote?: string },
  ): { ok: boolean; reason?: string } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    if (!(s.budgetLines ?? []).some((l) => l.id === lineId)) {
      return { ok: false, reason: 'Budget line not found' };
    }
    if (!frozen) {
      const note = (opts?.amendNote ?? '').trim();
      if (note.length < 4) {
        return {
          ok: false,
          reason: 'Unfreeze requires a short amend note',
        };
      }
    }
    const lines = (s.budgetLines ?? []).map((l) =>
      l.id === lineId
        ? {
            ...l,
            frozen,
            amendNote: !frozen
              ? (opts?.amendNote ?? '').trim()
              : l.amendNote,
          }
        : l,
    );
    return this.patchStewardship(kind, id, { budgetLines: lines });
  },

  addBlocker(
    kind: MissionStewardKind,
    id: string,
    input: {
      title: string;
      severity: 'BLOCKER' | 'RISK';
      ownerPersonId: string;
      deliveryItemId?: string;
      taskId?: string;
      note?: string;
    },
  ): { ok: boolean; reason?: string; blocker?: import('../domain/deliveryRisk').MissionBlocker } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    const title = input.title.trim();
    if (!title) return { ok: false, reason: 'Title required' };
    const blocker: import('../domain/deliveryRisk').MissionBlocker = {
      id: nid('blk'),
      title,
      severity: input.severity,
      status: 'OPEN',
      ownerPersonId: input.ownerPersonId,
      createdAt: new Date().toISOString(),
      deliveryItemId: input.deliveryItemId,
      taskId: input.taskId,
      note: input.note?.trim() || undefined,
    };
    const blockers = [...(s.blockers ?? []), blocker];
    const r = this.patchStewardship(kind, id, { blockers });
    return r.ok ? { ok: true, blocker } : r;
  },

  setBlockerStatus(
    kind: MissionStewardKind,
    id: string,
    blockerId: string,
    status: 'OPEN' | 'MITIGATING' | 'RESOLVED',
  ): { ok: boolean; reason?: string } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    const blockers = (s.blockers ?? []).map((b) =>
      b.id === blockerId
        ? {
            ...b,
            status,
            resolvedAt:
              status === 'RESOLVED' ? new Date().toISOString() : undefined,
          }
        : b,
    );
    if (!(s.blockers ?? []).some((b) => b.id === blockerId)) {
      return { ok: false, reason: 'Blocker not found' };
    }
    return this.patchStewardship(kind, id, { blockers });
  },

  spawnTasksFromTemplate(input: {
    templateId: string;
    ownerPersonId: string;
    createdByPersonId: string;
    systemId: SystemId;
    contextType: WorkTask['contextType'];
    contextId: string;
    contextLabel?: string;
    accountablePersonId?: string;
  }): { ok: boolean; reason?: string; tasks?: WorkTask[] } {
    const tpl = TASK_TEMPLATES.find((t) => t.id === input.templateId);
    if (!tpl) return { ok: false, reason: 'Unknown template' };
    const tasks = tpl.items.map((item) =>
      this.createTask({
        title: item.title,
        description: item.description,
        ownerPersonId: input.ownerPersonId,
        accountablePersonId: input.accountablePersonId,
        createdByPersonId: input.createdByPersonId,
        systemId: input.systemId,
        contextType: input.contextType,
        contextId: input.contextId,
        contextLabel: input.contextLabel,
        visibility: 'CHURCH',
      }),
    );
    return { ok: true, tasks };
  },

  issueAdvance(
    kind: MissionStewardKind,
    id: string,
    input: {
      holderPersonId: string;
      amount: number;
      purpose: string;
      personId: string;
      fundId?: string;
      allowWhileOpen?: boolean;
    },
  ): { ok: boolean; reason?: string; advance?: MissionAdvance } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    const open = openAdvances(s);
    if (open.length > 0 && !input.allowWhileOpen) {
      return {
        ok: false,
        reason: `${open.length} open advance(s) — retire first or force`,
      };
    }
    const amount = Math.max(0, Math.round(input.amount));
    if (amount <= 0) return { ok: false, reason: 'Amount required' };
    const advance: MissionAdvance = {
      id: nid('adv'),
      holderPersonId: input.holderPersonId,
      amount,
      fundId: input.fundId,
      purpose: input.purpose.trim() || 'Float',
      status: 'OPEN',
      issuedAt: new Date().toISOString(),
      issuedByPersonId: input.personId,
    };
    const advances = [...(s.advances ?? []), advance];
    const r = this.patchStewardship(kind, id, { advances });
    return r.ok ? { ok: true, advance } : r;
  },

  retireAdvance(
    kind: MissionStewardKind,
    id: string,
    advanceId: string,
    input: {
      personId: string;
      retiredSpent: number;
      returnedAmount?: number;
      receiptNote?: string;
      applyToUsedCost?: boolean;
    },
  ): { ok: boolean; reason?: string } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    const advances = [...(s.advances ?? [])];
    const idx = advances.findIndex((a) => a.id === advanceId);
    if (idx < 0) return { ok: false, reason: 'Advance not found' };
    if (advances[idx].status !== 'OPEN') {
      return { ok: false, reason: 'Already retired' };
    }
    const spent = Math.max(0, Math.round(input.retiredSpent));
    const returned =
      input.returnedAmount !== undefined
        ? Math.max(0, Math.round(input.returnedAmount))
        : Math.max(0, advances[idx].amount - spent);
    advances[idx] = {
      ...advances[idx],
      status: 'RETIRED',
      retiredAt: new Date().toISOString(),
      retiredByPersonId: input.personId,
      retiredSpent: spent,
      returnedAmount: returned,
      receiptNote: input.receiptNote?.trim() || undefined,
    };
    const patch: Partial<MissionStewardship> = { advances };
    if (input.applyToUsedCost !== false && spent > 0) {
      patch.usedCost = (Number(s.usedCost) || 0) + spent;
    }
    return this.patchStewardship(kind, id, patch);
  },

  addInKind(
    kind: MissionStewardKind,
    id: string,
    input: {
      label: string;
      personId: string;
      estimatedValue?: number;
      donorName?: string;
      note?: string;
    },
  ): { ok: boolean; reason?: string; item?: MissionInKind } {
    const s = this.stewardshipOf(kind, id);
    if (!s) return { ok: false, reason: 'Not found' };
    if (!input.label.trim()) return { ok: false, reason: 'Label required' };
    const item: MissionInKind = {
      id: nid('ik'),
      label: input.label.trim(),
      estimatedValue:
        input.estimatedValue !== undefined
          ? Math.max(0, Math.round(input.estimatedValue))
          : undefined,
      donorName: input.donorName?.trim() || undefined,
      notedAt: new Date().toISOString(),
      notedByPersonId: input.personId,
      note: input.note?.trim() || undefined,
    };
    const inKind = [...(s.inKind ?? []), item];
    const r = this.patchStewardship(kind, id, { inKind });
    return r.ok ? { ok: true, item } : r;
  },

  /**
   * Close current envelope period without ending the programme; start next.
   */
  renewProgramPhase(
    id: string,
    input: {
      personId: string;
      periodLabel: string;
      nextPeriodLabel: string;
      nextPlannedCost?: number;
      leftoverDecision?: LeftoverDecision;
      narrative?: string;
      clearUsedCost?: boolean;
    },
  ): { ok: boolean; reason?: string; program?: Program } {
    const p = this.getProgram(id);
    if (!p) return { ok: false, reason: 'Program not found' };
    if (p.status !== 'ACTIVE' && p.status !== 'PAUSED') {
      return { ok: false, reason: 'Only ACTIVE/PAUSED programmes can renew envelope' };
    }
    const renewal: MissionPhaseRenewal = {
      id: nid('ren'),
      periodLabel: input.periodLabel.trim() || p.envelopePeriod || 'Prior period',
      closedAt: new Date().toISOString(),
      closedByPersonId: input.personId,
      plannedCostSnapshot: p.plannedCost,
      usedCostSnapshot: p.usedCost,
      confirmedFundingSnapshot: (p.fundingPlan ?? [])
        .filter((f) => f.status === 'CONFIRMED')
        .reduce((sum, f) => sum + (Number(f.amount) || 0), 0),
      leftoverDecision: input.leftoverDecision,
      narrative: input.narrative?.trim() || undefined,
      nextPlannedCost: input.nextPlannedCost,
      nextPeriodLabel: input.nextPeriodLabel.trim(),
    };
    const phaseRenewals = [...(p.phaseRenewals ?? []), renewal];
    const patch: Partial<Program> = {
      phaseRenewals,
      envelopePeriod: input.nextPeriodLabel.trim(),
    };
    if (input.nextPlannedCost !== undefined) {
      patch.plannedCost = Math.max(0, Math.round(input.nextPlannedCost));
    }
    if (input.clearUsedCost !== false) {
      patch.usedCost = 0;
    }
    const program = this.updateProgram(id, patch);
    return program
      ? { ok: true, program }
      : { ok: false, reason: 'Update failed' };
  },

  /**
   * Record vault transfer and optionally tag as confirmed GENERAL_ALLOCATION.
   */
  recordStewardshipTransfer(input: {
    kind: MissionStewardKind;
    id: string;
    actorPersonId: string;
    fromFundId: string;
    toFundId: string;
    amount: number;
    description: string;
    tagAsConfirmedSource?: boolean;
  }): { ok: boolean; reason?: string } {
    const ctx =
      input.kind === 'PROGRAM'
        ? ({ contextType: 'PROGRAM' as const, contextId: input.id })
        : ({ contextType: 'PROJECT' as const, contextId: input.id });
    const posted = financeService.recordFundTransfer({
      actorPersonId: input.actorPersonId,
      fromFundId: input.fromFundId,
      toFundId: input.toFundId,
      amount: input.amount,
      description: input.description,
      ...ctx,
    });
    if (!posted.ok) return { ok: false, reason: posted.reason };
    if (input.tagAsConfirmedSource) {
      this.recordConfirmedAllocation(input.kind, input.id, {
        sourceType: 'GENERAL_ALLOCATION',
        label: input.description || 'Fund transfer in',
        amount: Math.round(input.amount),
        fundId: input.toFundId,
        personId: input.actorPersonId,
        note: `Transfer from ${input.fromFundId}`,
      });
    }
    return { ok: true };
  },
};
