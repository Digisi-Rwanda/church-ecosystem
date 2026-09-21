import { MEMBERSHIPS } from '../data/seed';
import {
  PROTOCOL_ABSENCE_REQUESTS,
  PROTOCOL_ACTIVITY,
  PROTOCOL_ALLOWED_MONTHS,
  PROTOCOL_ATTENDANCE,
  PROTOCOL_CONTRIBUTIONS,
  PROTOCOL_FILL_IN_OFFERS,
  PROTOCOL_HISTORY,
  PROTOCOL_MONTH_PLANS,
  PROTOCOL_NOTIFICATIONS,
  PROTOCOL_ROSTER,
  PROTOCOL_RULES,
  PROTOCOL_SERVICE_REPORTS,
  PROTOCOL_SERVICES,
  PROTOCOL_SWAP_PROPOSALS,
  PROTOCOL_TEAM_SLOTS,
  markAllProtocolNotificationsRead,
  markProtocolNotificationRead,
  pushProtocolAbsence,
  pushProtocolActivity,
  pushProtocolContribution,
  pushProtocolFillIn,
  pushProtocolHistory,
  pushProtocolNotification,
  pushProtocolSwap,
  replaceProtocolServices,
  replaceProtocolTeamSlots,
  updateProtocolAbsence,
  updateProtocolContribution,
  updateProtocolFillIn,
  updateProtocolMonthPlan,
  updateProtocolSwap,
  upsertProtocolAttendance,
  upsertProtocolServiceReport,
} from '../data/protocolSeed';
import { MUSIC_UNITS } from '../domain/musicUnits';
import {
  buildProtocolTeams,
  canServeKind,
  choirAllows,
  scoreAttendanceRow,
  validateProtocolTeams,
  type ChoirUnitsByPerson,
  type UnitsOnService,
} from '../domain/teamEngine';
import type {
  ProtocolActivityEvent,
  ProtocolAttendanceRecord,
  ProtocolAttendanceStatus,
  ProtocolContribution,
  ProtocolContributionType,
  ProtocolMonthPlan,
  ProtocolNotification,
  ProtocolNotificationKind,
  ProtocolOffice,
  ProtocolPaymentMethod,
  ProtocolRosterMember,
  ProtocolScheduleVersion,
  ProtocolService,
  ProtocolServiceKind,
  ProtocolSlotKind,
  ProtocolTeamRole,
  ProtocolTeamSlot,
} from '../domain/types';
import { peopleService } from './authService';
import {
  listClaimsPreferApi,
  submitClaimPreferApi,
  verifyClaimPreferApi,
} from './contributionApiBridge';
import { financeService } from './financeService';
import { musicScheduleService } from './musicScheduleService';

const PROTOCOL_KIND_SET = new Set<ProtocolServiceKind>([
  'SS1',
  'SS2',
  'TUESDAY',
  'IGABURO',
]);

function personName(personId: string): string {
  const p = peopleService.getById(personId);
  return p?.preferredName || p?.fullName || personId;
}

function nid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function notifyPeople(
  personIds: string[],
  kind: ProtocolNotificationKind,
  title: string,
  body: string,
  href?: string,
) {
  const at = new Date().toISOString();
  const unique = [...new Set(personIds)];
  for (const personId of unique) {
    pushProtocolNotification({
      id: nid('pnot'),
      personId,
      kind,
      title,
      body,
      createdAt: at,
      read: false,
      href,
    });
  }
}

function leadershipPersonIds(): string[] {
  return PROTOCOL_ROSTER.filter((m) =>
    ['PRESIDENT', 'VP', 'COORDINATOR', 'SECRETARY', 'TREASURER'].includes(
      m.office,
    ),
  ).map((m) => m.personId);
}

function coordinatorPersonIds(): string[] {
  return PROTOCOL_ROSTER.filter(
    (m) => m.office === 'COORDINATOR' && m.status !== 'INACTIVE',
  ).map((m) => m.personId);
}

function allRosterPersonIds(): string[] {
  return PROTOCOL_ROSTER.filter((m) => m.status !== 'INACTIVE').map(
    (m) => m.personId,
  );
}

function logActivity(
  actorPersonId: string,
  kind: ProtocolActivityEvent['kind'],
  summary: string,
) {
  pushProtocolActivity({
    id: nid('pact'),
    at: new Date().toISOString(),
    actorPersonId,
    kind,
    summary,
  });
}

type ActionResult = { ok: boolean; reason?: string };

function ensureDemoMusic(monthKey: string) {
  if ((PROTOCOL_ALLOWED_MONTHS as readonly string[]).includes(monthKey)) {
    musicScheduleService.ensureDemoPublished(monthKey);
  } else {
    musicScheduleService.ensureDemoPublished('2026-09');
  }
}

/** personId → Music unit ids from choir memberships. */
function buildChoirUnitsMap(): ChoirUnitsByPerson {
  const orgToMusic = new Map(
    MUSIC_UNITS.filter((u) => u.orgUnitId).map((u) => [u.orgUnitId!, u.id]),
  );
  const map: ChoirUnitsByPerson = new Map();
  for (const m of MEMBERSHIPS) {
    if (m.systemId !== 'sys-choir' || !m.orgUnitId) continue;
    if (m.status !== 'ACTIVE') continue;
    const unitId = orgToMusic.get(m.orgUnitId);
    if (!unitId) continue;
    const set = map.get(m.personId) ?? new Set<string>();
    set.add(unitId);
    map.set(m.personId, set);
  }
  return map;
}

/** musicServiceId → unit ids on published Music schedule. */
function buildUnitsOnService(monthKey: string): UnitsOnService {
  const map: UnitsOnService = new Map();
  const published = musicScheduleService.getPublished(monthKey);
  if (!published) return map;
  for (const a of published.assignments) {
    const set = map.get(a.serviceId) ?? new Set<string>();
    set.add(a.unitId);
    map.set(a.serviceId, set);
  }
  return map;
}

function syncServicesFromMusic(monthKey: string): ActionResult {
  const published = musicScheduleService.getPublished(monthKey);
  if (!published) {
    return {
      ok: false,
      reason: 'Publish Music schedule for this month first',
    };
  }
  const synced: ProtocolService[] = published.services
    .filter(
      (s) =>
        s.kind !== 'FRIDAY' &&
        PROTOCOL_KIND_SET.has(s.kind as ProtocolServiceKind),
    )
    .map((s) => ({
      id: `psvc-${s.id}`,
      monthKey,
      date: s.date,
      kind: s.kind as ProtocolServiceKind,
      label: s.label,
      targetTeamSize: 10,
      musicServiceId: s.id,
    }));
  const others = PROTOCOL_SERVICES.filter((s) => s.monthKey !== monthKey);
  replaceProtocolServices([...others, ...synced]);
  return { ok: true };
}

function staffTeamSlots(serviceId: string): ProtocolTeamSlot[] {
  return PROTOCOL_TEAM_SLOTS.filter(
    (s) => s.serviceId === serviceId && s.slotKind !== 'FILL_IN',
  );
}

function assertTeamsEditable(monthKey: string): ActionResult {
  const plan = PROTOCOL_MONTH_PLANS.find((p) => p.monthKey === monthKey);
  if (plan?.status === 'PUBLISHED') {
    return { ok: false, reason: 'Month is published — reopen to DRAFT first' };
  }
  if (plan?.status === 'REVIEW') {
    return {
      ok: false,
      reason: 'Month is in review — return to draft to edit teams',
    };
  }
  return { ok: true };
}

function whyNotOnTeam(
  member: ProtocolRosterMember,
  service: ProtocolService,
  personId: string,
  teamPersonIds: Set<string>,
  sameDaySs1: Set<string>,
  choirUnits: ChoirUnitsByPerson,
  unitsOnService: UnitsOnService,
): string | undefined {
  if (member.status !== 'ACTIVE') return 'Member is not ACTIVE';
  if (teamPersonIds.has(personId)) return 'Already on this team';
  if (!canServeKind(member, service.kind)) {
    return `Cannot serve ${service.kind}`;
  }
  if (member.unavailableDates.includes(service.date)) {
    return 'Unavailable on this date';
  }
  if (service.kind === 'SS2' && sameDaySs1.has(personId)) {
    return 'Already on SS1 the same Sunday';
  }
  if (service.kind === 'SS1') {
    const ss2 = PROTOCOL_SERVICES.find(
      (s) =>
        s.monthKey === service.monthKey &&
        s.date === service.date &&
        s.kind === 'SS2',
    );
    if (
      ss2 &&
      staffTeamSlots(ss2.id).some((s) => s.personId === personId)
    ) {
      return 'Already on SS2 the same Sunday';
    }
  }
  if (
    !choirAllows(
      member,
      service,
      choirUnits,
      unitsOnService,
      PROTOCOL_RULES.requireChoirOnService,
    )
  ) {
    return 'Choir not scheduled on this service (Music)';
  }
  return undefined;
}

function patchTeamSlot(
  serviceId: string,
  personId: string,
  patch: Partial<ProtocolTeamSlot>,
): ProtocolTeamSlot | null {
  let updated: ProtocolTeamSlot | null = null;
  const next = PROTOCOL_TEAM_SLOTS.map((s) => {
    if (s.serviceId !== serviceId || s.personId !== personId) return s;
    updated = { ...s, ...patch };
    return updated;
  });
  if (!updated) return null;
  replaceProtocolTeamSlots(next);
  return updated;
}

function teamLeadersOf(serviceId: string): string[] {
  return PROTOCOL_TEAM_SLOTS.filter(
    (s) =>
      s.serviceId === serviceId &&
      (s.role === 'TEAM_LEADER' || s.role === 'VICE_LEADER') &&
      (s.roleStatus === 'APPROVED' || s.roleStatus === 'MANUAL'),
  ).map((s) => s.personId);
}

function slotKindFor(
  serviceId: string,
  personId: string,
): ProtocolSlotKind | undefined {
  return PROTOCOL_TEAM_SLOTS.find(
    (s) => s.serviceId === serviceId && s.personId === personId,
  )?.slotKind;
}

export const protocolService = {
  allowedMonths(): string[] {
    return [...PROTOCOL_ALLOWED_MONTHS];
  },

  liveMonthKey(now = new Date()): string {
    ensureDemoMusic('2026-09');
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const key = `${y}-${m}`;
    if ((PROTOCOL_ALLOWED_MONTHS as readonly string[]).includes(key)) {
      return key;
    }
    return PROTOCOL_ALLOWED_MONTHS[0];
  },

  rules() {
    return PROTOCOL_RULES;
  },

  listRoster(activeOnly = false): ProtocolRosterMember[] {
    return PROTOCOL_ROSTER.filter((m) =>
      activeOnly ? m.status === 'ACTIVE' : true,
    );
  },

  rosterWithNames(activeOnly = false) {
    return this.listRoster(activeOnly).map((m) => ({
      ...m,
      name: personName(m.personId),
    }));
  },

  officeFor(personId: string): ProtocolOffice | null {
    const m = PROTOCOL_ROSTER.find(
      (r) => r.personId === personId && r.status !== 'INACTIVE',
    );
    return m?.office ?? null;
  },

  officeLabel(office: ProtocolOffice): string {
    const map: Record<ProtocolOffice, string> = {
      PRESIDENT: 'President',
      VP: 'Vice President',
      SECRETARY: 'Secretary',
      TREASURER: 'Treasurer',
      COORDINATOR: 'Coordinator',
      MEMBER: 'Member',
    };
    return map[office];
  },

  personLabel(personId: string): string {
    return personName(personId);
  },

  getMonthPlan(monthKey: string): ProtocolMonthPlan | null {
    return PROTOCOL_MONTH_PLANS.find((p) => p.monthKey === monthKey) ?? null;
  },

  listMonthPlans(): ProtocolMonthPlan[] {
    return PROTOCOL_MONTH_PLANS;
  },

  servicesForMonth(monthKey: string): ProtocolService[] {
    ensureDemoMusic(monthKey);
    if (
      PROTOCOL_SERVICES.every((s) => s.monthKey !== monthKey) &&
      musicScheduleService.getPublished(monthKey)
    ) {
      syncServicesFromMusic(monthKey);
    }
    return PROTOCOL_SERVICES.filter((s) => s.monthKey === monthKey).sort(
      (a, b) =>
        a.date === b.date
          ? a.kind.localeCompare(b.kind)
          : a.date.localeCompare(b.date),
    );
  },

  getService(serviceId: string): ProtocolService | null {
    return PROTOCOL_SERVICES.find((s) => s.id === serviceId) ?? null;
  },

  slotsForMonth(monthKey: string): ProtocolTeamSlot[] {
    const serviceIds = new Set(
      this.servicesForMonth(monthKey).map((s) => s.id),
    );
    return PROTOCOL_TEAM_SLOTS.filter((s) => serviceIds.has(s.serviceId));
  },

  teamForService(serviceId: string): ProtocolTeamSlot[] {
    return PROTOCOL_TEAM_SLOTS.filter((s) => s.serviceId === serviceId);
  },

  dutyLoad(monthKey: string): Array<{
    personId: string;
    name: string;
    count: number;
    office: ProtocolOffice;
  }> {
    const slots = this.slotsForMonth(monthKey).filter(
      (s) => s.slotKind !== 'FILL_IN',
    );
    const counts = new Map<string, number>();
    for (const s of slots) {
      counts.set(s.personId, (counts.get(s.personId) ?? 0) + 1);
    }
    return this.listRoster()
      .map((m) => ({
        personId: m.personId,
        name: personName(m.personId),
        count: counts.get(m.personId) ?? 0,
        office: m.office,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  },

  /** Generate / rebuild draft teams for a month (live or next only). */
  generateTeams(monthKey: string): {
    ok: boolean;
    reason?: string;
    warnings: string[];
    slotCount: number;
  } {
    if (!(PROTOCOL_ALLOWED_MONTHS as readonly string[]).includes(monthKey)) {
      return {
        ok: false,
        reason: 'Only live month and next month can be scheduled',
        warnings: [],
        slotCount: 0,
      };
    }
    const plan = this.getMonthPlan(monthKey);
    if (plan?.status === 'PUBLISHED') {
      return {
        ok: false,
        reason: 'Month is published — reopen to DRAFT before rebuilding',
        warnings: [],
        slotCount: 0,
      };
    }
    if (plan?.status === 'REVIEW') {
      return {
        ok: false,
        reason: 'Month is in leadership review — return to draft first',
        warnings: [],
        slotCount: 0,
      };
    }

    ensureDemoMusic(monthKey);
    const published = musicScheduleService.getPublished(monthKey);
    if (!published) {
      return {
        ok: false,
        reason: 'Publish Music schedule for this month first',
        warnings: [],
        slotCount: 0,
      };
    }

    const sync = syncServicesFromMusic(monthKey);
    if (!sync.ok) {
      return {
        ok: false,
        reason: sync.reason,
        warnings: [],
        slotCount: 0,
      };
    }

    const services = this.servicesForMonth(monthKey);
    const choirUnits = buildChoirUnitsMap();
    const unitsOnService = buildUnitsOnService(monthKey);

    const { slots, warnings } = buildProtocolTeams({
      services,
      roster: PROTOCOL_ROSTER,
      rules: PROTOCOL_RULES,
      choirUnits,
      unitsOnService,
    });

    const otherSlots = PROTOCOL_TEAM_SLOTS.filter((s) => {
      const svc = PROTOCOL_SERVICES.find((x) => x.id === s.serviceId);
      return svc && svc.monthKey !== monthKey;
    });
    replaceProtocolTeamSlots([...otherSlots, ...slots]);

    const issues = validateProtocolTeams({
      services,
      roster: PROTOCOL_ROSTER,
      slots,
      rules: PROTOCOL_RULES,
      choirUnits,
      unitsOnService,
    });

    updateProtocolMonthPlan(monthKey, {
      status: 'DRAFT',
      generatedAt: new Date().toISOString(),
      validationNotes: [...warnings, ...issues],
      submittedForReviewAt: undefined,
      submittedByPersonId: undefined,
      reviewedAt: undefined,
      reviewedByPersonId: undefined,
    });

    notifyPeople(
      leadershipPersonIds(),
      'TEAMS_BUILT',
      `Teams built for ${monthKey}`,
      `${slots.length} slots assigned · ${warnings.length + issues.length} notes`,
      '/systems/protocol/teams',
    );

    return {
      ok: true,
      warnings: [...warnings, ...issues],
      slotCount: slots.length,
    };
  },

  validateMonth(monthKey: string): string[] {
    return validateProtocolTeams({
      services: this.servicesForMonth(monthKey),
      roster: PROTOCOL_ROSTER,
      slots: this.slotsForMonth(monthKey),
      rules: PROTOCOL_RULES,
      choirUnits: buildChoirUnitsMap(),
      unitsOnService: buildUnitsOnService(monthKey),
    });
  },

  submitForReview(monthKey: string, actorPersonId: string): ActionResult {
    const plan = this.getMonthPlan(monthKey);
    if (!plan) return { ok: false, reason: 'Unknown month' };
    if (plan.status !== 'DRAFT') {
      return { ok: false, reason: 'Only DRAFT months can be submitted' };
    }
    if (this.slotsForMonth(monthKey).length === 0) {
      return { ok: false, reason: 'Generate teams before submitting' };
    }
    const issues = this.validateMonth(monthKey);
    const blocking = issues.filter((i) => i.includes('both SS1 and SS2'));
    if (blocking.length > 0) {
      return { ok: false, reason: blocking[0] };
    }
    updateProtocolMonthPlan(monthKey, {
      status: 'REVIEW',
      submittedForReviewAt: new Date().toISOString(),
      submittedByPersonId: actorPersonId,
      validationNotes: issues,
    });
    logActivity(
      actorPersonId,
      'SUBMITTED_REVIEW',
      `Submitted ${monthKey} for leadership review`,
    );
    notifyPeople(
      PROTOCOL_ROSTER.filter(
        (m) => m.office === 'PRESIDENT' || m.office === 'VP',
      ).map((m) => m.personId),
      'SUBMITTED_REVIEW',
      `${monthKey} ready for review`,
      `${personName(actorPersonId)} submitted draft teams`,
      '/systems/protocol/review',
    );
    return { ok: true };
  },

  markReviewed(monthKey: string, actorPersonId: string): ActionResult {
    const plan = this.getMonthPlan(monthKey);
    if (!plan) return { ok: false, reason: 'Unknown month' };
    if (plan.status !== 'REVIEW') {
      return { ok: false, reason: 'Month is not in REVIEW' };
    }
    updateProtocolMonthPlan(monthKey, {
      reviewedAt: new Date().toISOString(),
      reviewedByPersonId: actorPersonId,
    });
    return { ok: true };
  },

  returnToDraft(monthKey: string): ActionResult {
    const plan = this.getMonthPlan(monthKey);
    if (!plan) return { ok: false, reason: 'Unknown month' };
    if (plan.status !== 'REVIEW' && plan.status !== 'PUBLISHED') {
      return { ok: false, reason: 'Nothing to reopen' };
    }
    updateProtocolMonthPlan(monthKey, {
      status: 'DRAFT',
      reviewedAt: undefined,
      reviewedByPersonId: undefined,
      publishedAt: undefined,
      publishedByPersonId: undefined,
    });
    return { ok: true };
  },

  publish(monthKey: string, actorPersonId: string): ActionResult & {
    version?: number;
  } {
    const plan = this.getMonthPlan(monthKey);
    if (!plan) return { ok: false, reason: 'Unknown month' };
    if (plan.status !== 'REVIEW') {
      return { ok: false, reason: 'Publish requires REVIEW status' };
    }
    if (!plan.reviewedByPersonId) {
      return {
        ok: false,
        reason: 'Leadership must mark reviewed before publish',
      };
    }
    const slots = this.slotsForMonth(monthKey);
    if (slots.length === 0) {
      return { ok: false, reason: 'No team slots to publish' };
    }
    const version = plan.version + 1;
    const publishedAt = new Date().toISOString();
    pushProtocolHistory({
      id: `psv-${monthKey}-v${version}`,
      monthKey,
      version,
      publishedAt,
      publishedByPersonId: actorPersonId,
      slots: slots.map((s) => ({ ...s })),
      validationNotes: [...plan.validationNotes],
    });
    updateProtocolMonthPlan(monthKey, {
      status: 'PUBLISHED',
      version,
      publishedAt,
      publishedByPersonId: actorPersonId,
    });
    logActivity(
      actorPersonId,
      'SCHEDULE_PUBLISHED',
      `Published ${monthKey} schedule v${version}`,
    );
    notifyPeople(
      allRosterPersonIds(),
      'SCHEDULE_PUBLISHED',
      `${monthKey} schedule published`,
      `Version ${version} is official — check My schedule`,
      '/systems/protocol/mine',
    );
    return { ok: true, version };
  },

  listHistory(): ProtocolScheduleVersion[] {
    return [...PROTOCOL_HISTORY].sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt),
    );
  },

  getHistoryVersion(id: string): ProtocolScheduleVersion | null {
    return PROTOCOL_HISTORY.find((v) => v.id === id) ?? null;
  },

  /** Published assignments for a person (current + history). */
  mySchedule(personId: string): Array<{
    monthKey: string;
    version: number;
    publishedAt: string;
    serviceId: string;
    date: string;
    kind: string;
    label: string;
    role: ProtocolTeamRole;
    slotKind: ProtocolSlotKind;
    fromHistory: boolean;
  }> {
    const rows: Array<{
      monthKey: string;
      version: number;
      publishedAt: string;
      serviceId: string;
      date: string;
      kind: string;
      label: string;
      role: ProtocolTeamRole;
      slotKind: ProtocolSlotKind;
      fromHistory: boolean;
    }> = [];

    for (const plan of PROTOCOL_MONTH_PLANS) {
      if (plan.status !== 'PUBLISHED' || !plan.publishedAt) continue;
      for (const slot of this.slotsForMonth(plan.monthKey)) {
        if (slot.personId !== personId) continue;
        const svc = this.getService(slot.serviceId);
        if (!svc) continue;
        rows.push({
          monthKey: plan.monthKey,
          version: plan.version,
          publishedAt: plan.publishedAt,
          serviceId: svc.id,
          date: svc.date,
          kind: svc.kind,
          label: svc.label,
          role: slot.role,
          slotKind: slot.slotKind,
          fromHistory: false,
        });
      }
    }

    for (const hist of PROTOCOL_HISTORY) {
      const livePublished = PROTOCOL_MONTH_PLANS.find(
        (p) =>
          p.monthKey === hist.monthKey &&
          p.status === 'PUBLISHED' &&
          p.version === hist.version,
      );
      if (livePublished) continue;
      for (const slot of hist.slots) {
        if (slot.personId !== personId) continue;
        const svc = this.getService(slot.serviceId);
        rows.push({
          monthKey: hist.monthKey,
          version: hist.version,
          publishedAt: hist.publishedAt,
          serviceId: slot.serviceId,
          date: svc?.date ?? '—',
          kind: svc?.kind ?? '—',
          label: svc?.label ?? slot.serviceId,
          role: slot.role,
          slotKind: slot.slotKind,
          fromHistory: true,
        });
      }
    }

    return rows.sort((a, b) => a.date.localeCompare(b.date));
  },

  attendanceForService(serviceId: string): ProtocolAttendanceRecord[] {
    return PROTOCOL_ATTENDANCE.filter((r) => r.serviceId === serviceId);
  },

  attendanceForMonth(monthKey: string): ProtocolAttendanceRecord[] {
    const ids = new Set(this.servicesForMonth(monthKey).map((s) => s.id));
    return PROTOCOL_ATTENDANCE.filter((r) => ids.has(r.serviceId));
  },

  recordAttendance(input: {
    serviceId: string;
    personId: string;
    status: ProtocolAttendanceStatus;
    recordedByPersonId: string;
    notes?: string;
  }): ActionResult {
    const service = this.getService(input.serviceId);
    if (!service) return { ok: false, reason: 'Unknown service' };
    const plan = this.getMonthPlan(service.monthKey);
    if (plan?.status !== 'PUBLISHED') {
      return { ok: false, reason: 'Attendance only after publish' };
    }
    const onTeam = this.teamForService(input.serviceId).some(
      (s) => s.personId === input.personId,
    );
    if (!onTeam) {
      return { ok: false, reason: 'Person is not on this service team' };
    }
    upsertProtocolAttendance({
      id: `patt-${input.serviceId}-${input.personId}`,
      serviceId: input.serviceId,
      personId: input.personId,
      status: input.status,
      recordedByPersonId: input.recordedByPersonId,
      recordedAt: new Date().toISOString(),
      notes: input.notes,
      slotKind: slotKindFor(input.serviceId, input.personId),
    });
    return { ok: true };
  },

  attendanceSummary(monthKey: string) {
    const services = this.servicesForMonth(monthKey);
    return services.map((s) => {
      const team = this.teamForService(s.id);
      const records = this.attendanceForService(s.id);
      const present = records.filter(
        (r) => r.status === 'PRESENT' || r.status === 'HALF_PRESENT',
      ).length;
      return {
        service: s,
        teamSize: team.length,
        recorded: records.length,
        present,
      };
    });
  },

  stats(monthKey: string) {
    const roster = this.listRoster();
    const services = this.servicesForMonth(monthKey);
    const slots = this.slotsForMonth(monthKey);
    const plan = this.getMonthPlan(monthKey);
    return {
      rosterActive: roster.filter((m) => m.status === 'ACTIVE').length,
      rosterTotal: roster.length,
      services: services.length,
      slots: slots.length,
      status: plan?.status ?? 'OPEN',
      version: plan?.version ?? 0,
      historyCount: PROTOCOL_HISTORY.length,
      pendingContributions: PROTOCOL_CONTRIBUTIONS.filter(
        (c) => c.status === 'PENDING',
      ).length,
      unreadNotifications: 0,
    };
  },

  statsForPerson(monthKey: string, personId: string) {
    const base = this.stats(monthKey);
    return {
      ...base,
      unreadNotifications: this.unreadCount(personId),
    };
  },

  /* ─── Team roles (coordinator) ─── */

  approveTeamRole(
    serviceId: string,
    personId: string,
    actorPersonId: string,
  ): ActionResult {
    const slot = this.teamForService(serviceId).find(
      (s) => s.personId === personId,
    );
    if (!slot) return { ok: false, reason: 'Person is not on this team' };
    const role = slot.recommendedRole;
    if (!role || role === 'MEMBER') {
      return { ok: false, reason: 'No recommended leadership role to approve' };
    }
    patchTeamSlot(serviceId, personId, {
      role,
      roleStatus: 'APPROVED',
    });
    logActivity(
      actorPersonId,
      'GENERAL',
      `Approved ${role} for ${personName(personId)}`,
    );
    notifyPeople(
      [personId],
      'GENERAL',
      `You are ${role === 'TEAM_LEADER' ? 'Team Leader' : 'Vice Team Leader'}`,
      `Approved for ${this.getService(serviceId)?.label ?? serviceId}`,
      '/systems/protocol/mine',
    );
    return { ok: true };
  },

  setTeamRole(
    serviceId: string,
    personId: string,
    role: ProtocolTeamRole,
    actorPersonId: string,
  ): ActionResult {
    const slot = this.teamForService(serviceId).find(
      (s) => s.personId === personId,
    );
    if (!slot) return { ok: false, reason: 'Person is not on this team' };
    if (role === 'TEAM_LEADER' || role === 'VICE_LEADER') {
      const existing = this.teamForService(serviceId).find(
        (s) =>
          s.personId !== personId &&
          s.role === role &&
          (s.roleStatus === 'APPROVED' || s.roleStatus === 'MANUAL'),
      );
      if (existing) {
        patchTeamSlot(serviceId, existing.personId, {
          role: 'MEMBER',
          roleStatus: 'MANUAL',
          recommendedRole: existing.recommendedRole,
        });
      }
    }
    patchTeamSlot(serviceId, personId, {
      role,
      roleStatus: 'MANUAL',
      recommendedRole: role !== 'MEMBER' ? role : slot.recommendedRole,
    });
    logActivity(
      actorPersonId,
      'GENERAL',
      `Set ${role} for ${personName(personId)} on ${serviceId}`,
    );
    return { ok: true };
  },

  /** Active roster members eligible to join a service team (excludes current team). */
  eligibleForServiceTeam(serviceId: string): ProtocolRosterMember[] {
    const service = this.getService(serviceId);
    if (!service) return [];
    const team = staffTeamSlots(serviceId);
    const teamPersonIds = new Set(team.map((s) => s.personId));
    const sameDaySs1 = new Set(
      staffTeamSlots(
        PROTOCOL_SERVICES.find(
          (s) => s.date === service.date && s.kind === 'SS1',
        )?.id ?? '',
      ).map((s) => s.personId),
    );
    const choirUnits = buildChoirUnitsMap();
    const unitsOnService = buildUnitsOnService(service.monthKey);
    return PROTOCOL_ROSTER.filter((m) => {
      if (m.status !== 'ACTIVE') return false;
      return (
        whyNotOnTeam(
          m,
          service,
          m.personId,
          teamPersonIds,
          sameDaySs1,
          choirUnits,
          unitsOnService,
        ) === undefined
      );
    });
  },

  addTeamMember(
    serviceId: string,
    personId: string,
    actorPersonId: string,
  ): ActionResult {
    const service = this.getService(serviceId);
    if (!service) return { ok: false, reason: 'Unknown service' };
    const editable = assertTeamsEditable(service.monthKey);
    if (!editable.ok) return editable;
    const team = staffTeamSlots(serviceId);
    const target = service.targetTeamSize || PROTOCOL_RULES.defaultTeamSize;
    if (team.length >= target) {
      return {
        ok: false,
        reason: `Team is full (${target}) — remove or replace someone first`,
      };
    }
    const member = PROTOCOL_ROSTER.find((m) => m.personId === personId);
    if (!member) return { ok: false, reason: 'Not on protocol roster' };
    const teamPersonIds = new Set(team.map((s) => s.personId));
    const sameDaySs1 = new Set(
      staffTeamSlots(
        PROTOCOL_SERVICES.find(
          (s) =>
            s.monthKey === service.monthKey &&
            s.date === service.date &&
            s.kind === 'SS1',
        )?.id ?? '',
      ).map((s) => s.personId),
    );
    const block = whyNotOnTeam(
      member,
      service,
      personId,
      teamPersonIds,
      sameDaySs1,
      buildChoirUnitsMap(),
      buildUnitsOnService(service.monthKey),
    );
    if (block) return { ok: false, reason: block };
    const slot: ProtocolTeamSlot = {
      id: nid('pts-manual'),
      serviceId,
      personId,
      source: 'MANUAL',
      role: 'MEMBER',
      slotKind: 'REGULAR',
    };
    replaceProtocolTeamSlots([...PROTOCOL_TEAM_SLOTS, slot]);
    logActivity(
      actorPersonId,
      'GENERAL',
      `Added ${personName(personId)} to ${service.label}`,
    );
    return { ok: true };
  },

  removeTeamMember(
    serviceId: string,
    personId: string,
    actorPersonId: string,
  ): ActionResult {
    const service = this.getService(serviceId);
    if (!service) return { ok: false, reason: 'Unknown service' };
    const editable = assertTeamsEditable(service.monthKey);
    if (!editable.ok) return editable;
    const team = staffTeamSlots(serviceId);
    const target = service.targetTeamSize || PROTOCOL_RULES.defaultTeamSize;
    if (team.length <= target) {
      return {
        ok: false,
        reason: `Team must stay at ${target} — use Replace instead of remove`,
      };
    }
    const slot = team.find((s) => s.personId === personId);
    if (!slot) return { ok: false, reason: 'Person is not on this team' };
    replaceProtocolTeamSlots(
      PROTOCOL_TEAM_SLOTS.filter((s) => s.id !== slot.id),
    );
    logActivity(
      actorPersonId,
      'GENERAL',
      `Removed ${personName(personId)} from ${service.label}`,
    );
    return { ok: true };
  },

  replaceTeamMember(
    serviceId: string,
    fromPersonId: string,
    toPersonId: string,
    actorPersonId: string,
  ): ActionResult {
    const service = this.getService(serviceId);
    if (!service) return { ok: false, reason: 'Unknown service' };
    const editable = assertTeamsEditable(service.monthKey);
    if (!editable.ok) return editable;
    const team = staffTeamSlots(serviceId);
    const slot = team.find((s) => s.personId === fromPersonId);
    if (!slot) return { ok: false, reason: 'Person is not on this team' };
    if (fromPersonId === toPersonId) {
      return { ok: false, reason: 'Choose a different replacement' };
    }
    const member = PROTOCOL_ROSTER.find((m) => m.personId === toPersonId);
    if (!member) return { ok: false, reason: 'Replacement not on roster' };
    const teamPersonIds = new Set(
      team.filter((s) => s.personId !== fromPersonId).map((s) => s.personId),
    );
    const sameDaySs1 = new Set(
      staffTeamSlots(
        PROTOCOL_SERVICES.find(
          (s) =>
            s.monthKey === service.monthKey &&
            s.date === service.date &&
            s.kind === 'SS1',
        )?.id ?? '',
      )
        .filter((s) => s.personId !== fromPersonId)
        .map((s) => s.personId),
    );
    const block = whyNotOnTeam(
      member,
      service,
      toPersonId,
      teamPersonIds,
      sameDaySs1,
      buildChoirUnitsMap(),
      buildUnitsOnService(service.monthKey),
    );
    if (block) return { ok: false, reason: block };
    replaceProtocolTeamSlots(
      PROTOCOL_TEAM_SLOTS.map((s) =>
        s.id === slot.id
          ? {
              ...s,
              personId: toPersonId,
              source: 'MANUAL',
              role: 'MEMBER',
              roleStatus: undefined,
              recommendedRole: undefined,
            }
          : s,
      ),
    );
    logActivity(
      actorPersonId,
      'GENERAL',
      `Replaced ${personName(fromPersonId)} with ${personName(toPersonId)} on ${service.label}`,
    );
    return { ok: true };
  },

  isTeamLeaderOf(serviceId: string, personId: string): boolean {
    return teamLeadersOf(serviceId).includes(personId);
  },

  /* ─── Absence / fill-in / swap / reports ─── */

  listAbsenceRequests(filter?: {
    serviceId?: string;
    personId?: string;
    status?: (typeof PROTOCOL_ABSENCE_REQUESTS)[number]['status'];
  }) {
    return PROTOCOL_ABSENCE_REQUESTS.filter((r) => {
      if (filter?.serviceId && r.serviceId !== filter.serviceId) return false;
      if (filter?.personId && r.personId !== filter.personId) return false;
      if (filter?.status && r.status !== filter.status) return false;
      return true;
    });
  },

  requestAbsence(
    serviceId: string,
    personId: string,
    reason: string,
  ): ActionResult & { id?: string } {
    const onTeam = this.teamForService(serviceId).some(
      (s) => s.personId === personId,
    );
    if (!onTeam) {
      return { ok: false, reason: 'You are not scheduled on this service' };
    }
    const pending = PROTOCOL_ABSENCE_REQUESTS.find(
      (r) =>
        r.serviceId === serviceId &&
        r.personId === personId &&
        r.status === 'PENDING',
    );
    if (pending) {
      return { ok: false, reason: 'Absence request already pending' };
    }
    const id = nid('pabs');
    pushProtocolAbsence({
      id,
      serviceId,
      personId,
      reason: reason.trim() || 'Unavailable',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });
    const leaders = teamLeadersOf(serviceId);
    notifyPeople(
      leaders.length > 0 ? leaders : coordinatorPersonIds(),
      'ABSENCE_REQUEST',
      'Absence request',
      `${personName(personId)} · ${this.getService(serviceId)?.label ?? serviceId}`,
      '/systems/protocol/attendance',
    );
    return { ok: true, id };
  },

  decideAbsence(
    requestId: string,
    decision: 'EXCUSED' | 'DENIED',
    actorPersonId: string,
  ): ActionResult {
    const req = PROTOCOL_ABSENCE_REQUESTS.find((r) => r.id === requestId);
    if (!req) return { ok: false, reason: 'Unknown absence request' };
    if (req.status !== 'PENDING') {
      return { ok: false, reason: 'Request already decided' };
    }
    if (!this.isTeamLeaderOf(req.serviceId, actorPersonId)) {
      return { ok: false, reason: 'Only Team Leader / Vice may decide' };
    }
    updateProtocolAbsence(requestId, {
      status: decision,
      decidedByPersonId: actorPersonId,
      decidedAt: new Date().toISOString(),
    });
    // Excused → seek fill-in; EXCUSED attendance only if no fill-in found.
    // Denied → if they miss, TL marks ABSENT on attendance.
    notifyPeople(
      [req.personId],
      'ABSENCE_REQUEST',
      decision === 'EXCUSED' ? 'Absence excused — fill-in may be sought' : 'Absence denied',
      this.getService(req.serviceId)?.label ?? req.serviceId,
      '/systems/protocol/mine',
    );
    return { ok: true };
  },

  listFillInOffers(filter?: {
    serviceId?: string;
    candidatePersonId?: string;
    status?: (typeof PROTOCOL_FILL_IN_OFFERS)[number]['status'];
  }) {
    return PROTOCOL_FILL_IN_OFFERS.filter((o) => {
      if (filter?.serviceId && o.serviceId !== filter.serviceId) return false;
      if (
        filter?.candidatePersonId &&
        o.candidatePersonId !== filter.candidatePersonId
      ) {
        return false;
      }
      if (filter?.status && o.status !== filter.status) return false;
      return true;
    });
  },

  offerFillIn(input: {
    serviceId: string;
    excusedPersonId: string;
    candidatePersonId: string;
    offeredByPersonId: string;
  }): ActionResult & { id?: string } {
    if (!this.isTeamLeaderOf(input.serviceId, input.offeredByPersonId)) {
      return { ok: false, reason: 'Only Team Leader / Vice may offer fill-in' };
    }
    const excusedOnTeam = this.teamForService(input.serviceId).some(
      (s) => s.personId === input.excusedPersonId,
    );
    if (!excusedOnTeam) {
      return { ok: false, reason: 'Excused person is not on this team' };
    }
    const already = this.teamForService(input.serviceId).some(
      (s) => s.personId === input.candidatePersonId,
    );
    if (already) {
      return { ok: false, reason: 'Candidate is already on this team' };
    }
    const onRoster = PROTOCOL_ROSTER.some(
      (m) =>
        m.personId === input.candidatePersonId && m.status === 'ACTIVE',
    );
    if (!onRoster) {
      return { ok: false, reason: 'Candidate is not an active roster member' };
    }
    const id = nid('pfill');
    pushProtocolFillIn({
      id,
      serviceId: input.serviceId,
      excusedPersonId: input.excusedPersonId,
      candidatePersonId: input.candidatePersonId,
      offeredByPersonId: input.offeredByPersonId,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });
    notifyPeople(
      [input.candidatePersonId],
      'FILL_IN_OFFER',
      'Fill-in offer',
      `Cover for ${personName(input.excusedPersonId)} · ${this.getService(input.serviceId)?.label ?? input.serviceId}`,
      '/systems/protocol/mine',
    );
    return { ok: true, id };
  },

  respondFillIn(
    offerId: string,
    decision: 'ACCEPTED' | 'DECLINED',
    actorPersonId: string,
  ): ActionResult {
    const offer = PROTOCOL_FILL_IN_OFFERS.find((o) => o.id === offerId);
    if (!offer) return { ok: false, reason: 'Unknown fill-in offer' };
    if (offer.status !== 'PENDING') {
      return { ok: false, reason: 'Offer already responded' };
    }
    if (offer.candidatePersonId !== actorPersonId) {
      return { ok: false, reason: 'Only the candidate may respond' };
    }
    updateProtocolFillIn(offerId, {
      status: decision,
      respondedAt: new Date().toISOString(),
    });
    if (decision === 'ACCEPTED') {
      const withoutExcused = PROTOCOL_TEAM_SLOTS.filter(
        (s) =>
          !(
            s.serviceId === offer.serviceId &&
            s.personId === offer.excusedPersonId
          ),
      );
      const exists = withoutExcused.some(
        (s) =>
          s.serviceId === offer.serviceId &&
          s.personId === offer.candidatePersonId,
      );
      const next = exists
        ? withoutExcused
        : [
            ...withoutExcused,
            {
              id: nid('pts'),
              serviceId: offer.serviceId,
              personId: offer.candidatePersonId,
              source: 'FILL_IN' as const,
              role: 'MEMBER' as const,
              slotKind: 'FILL_IN' as const,
              replacedPersonId: offer.excusedPersonId,
            },
          ];
      replaceProtocolTeamSlots(next);
      notifyPeople(
        [offer.offeredByPersonId, offer.excusedPersonId],
        'FILL_IN_OFFER',
        'Fill-in accepted',
        `${personName(actorPersonId)} will cover`,
        '/systems/protocol/attendance',
      );
    } else {
      // Candidate declined — if no other pending offers, TL may mark excused.
      const otherPending = PROTOCOL_FILL_IN_OFFERS.some(
        (o) =>
          o.id !== offerId &&
          o.serviceId === offer.serviceId &&
          o.excusedPersonId === offer.excusedPersonId &&
          o.status === 'PENDING',
      );
      if (!otherPending) {
        notifyPeople(
          teamLeadersOf(offer.serviceId),
          'FILL_IN_OFFER',
          'No fill-in yet',
          `${personName(offer.excusedPersonId)} still needs cover or EXCUSED mark`,
          '/systems/protocol/attendance',
        );
      }
    }
    return { ok: true };
  },

  listSwapProposals(filter?: {
    serviceId?: string;
    personId?: string;
    status?: (typeof PROTOCOL_SWAP_PROPOSALS)[number]['status'];
  }) {
    return PROTOCOL_SWAP_PROPOSALS.filter((s) => {
      if (filter?.serviceId && s.serviceId !== filter.serviceId) return false;
      if (
        filter?.personId &&
        s.proposerPersonId !== filter.personId &&
        s.targetPersonId !== filter.personId
      ) {
        return false;
      }
      if (filter?.status && s.status !== filter.status) return false;
      return true;
    });
  },

  proposeSwap(input: {
    serviceId: string;
    proposerPersonId: string;
    targetPersonId: string;
  }): ActionResult & { id?: string } {
    const proposerSlot = this.teamForService(input.serviceId).find(
      (s) => s.personId === input.proposerPersonId,
    );
    if (!proposerSlot) {
      return { ok: false, reason: 'You are not scheduled on this service' };
    }
    if (input.proposerPersonId === input.targetPersonId) {
      return { ok: false, reason: 'Cannot swap with yourself' };
    }
    const targetOnSame = this.teamForService(input.serviceId).some(
      (s) => s.personId === input.targetPersonId,
    );
    if (targetOnSame) {
      return { ok: false, reason: 'Target is already on this service' };
    }
    const onRoster = PROTOCOL_ROSTER.some(
      (m) => m.personId === input.targetPersonId && m.status === 'ACTIVE',
    );
    if (!onRoster) {
      return { ok: false, reason: 'Target is not an active roster member' };
    }
    const id = nid('pswap');
    pushProtocolSwap({
      id,
      serviceId: input.serviceId,
      proposerPersonId: input.proposerPersonId,
      targetPersonId: input.targetPersonId,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });
    notifyPeople(
      [input.targetPersonId],
      'SWAP_PROPOSAL',
      'Swap proposal',
      `${personName(input.proposerPersonId)} asks you to take ${this.getService(input.serviceId)?.label ?? input.serviceId}`,
      '/systems/protocol/mine',
    );
    return { ok: true, id };
  },

  respondSwap(
    proposalId: string,
    decision: 'ACCEPTED' | 'DECLINED',
    actorPersonId: string,
  ): ActionResult {
    const prop = PROTOCOL_SWAP_PROPOSALS.find((s) => s.id === proposalId);
    if (!prop) return { ok: false, reason: 'Unknown swap proposal' };
    if (prop.status !== 'PENDING') {
      return { ok: false, reason: 'Proposal already responded' };
    }
    if (prop.targetPersonId !== actorPersonId) {
      return { ok: false, reason: 'Only the target may respond' };
    }
    updateProtocolSwap(proposalId, {
      status: decision,
      respondedAt: new Date().toISOString(),
    });
    if (decision === 'ACCEPTED') {
      const proposerSlot = this.teamForService(prop.serviceId).find(
        (s) => s.personId === prop.proposerPersonId,
      );
      if (!proposerSlot) {
        return { ok: false, reason: 'Proposer is no longer on the team' };
      }
      const next = PROTOCOL_TEAM_SLOTS.filter(
        (s) =>
          !(
            s.serviceId === prop.serviceId &&
            s.personId === prop.proposerPersonId
          ),
      );
      next.push({
        ...proposerSlot,
        id: nid('pts'),
        personId: prop.targetPersonId,
        source: 'SWAP',
        role: 'MEMBER',
        recommendedRole: undefined,
        roleStatus: undefined,
        replacedPersonId: prop.proposerPersonId,
      });
      replaceProtocolTeamSlots(next);
      notifyPeople(
        [prop.proposerPersonId, ...teamLeadersOf(prop.serviceId)],
        'SWAP_PROPOSAL',
        'Swap accepted',
        `${personName(actorPersonId)} takes the duty`,
        '/systems/protocol/teams',
      );
    }
    return { ok: true };
  },

  listServiceReports(serviceId?: string) {
    return PROTOCOL_SERVICE_REPORTS.filter((r) =>
      serviceId ? r.serviceId === serviceId : true,
    );
  },

  submitServiceReport(input: {
    serviceId: string;
    authorPersonId: string;
    challenges: string;
    solutions: string;
    issues: string;
    recommendations: string;
  }): ActionResult & { id?: string } {
    if (!this.isTeamLeaderOf(input.serviceId, input.authorPersonId)) {
      return {
        ok: false,
        reason: 'Only Team Leader / Vice may submit the service report',
      };
    }
    if (!this.getService(input.serviceId)) {
      return { ok: false, reason: 'Unknown service' };
    }
    const id = `psr-${input.serviceId}`;
    upsertProtocolServiceReport({
      id,
      serviceId: input.serviceId,
      authorPersonId: input.authorPersonId,
      challenges: input.challenges,
      solutions: input.solutions,
      issues: input.issues,
      recommendations: input.recommendations,
      submittedAt: new Date().toISOString(),
    });
    notifyPeople(
      coordinatorPersonIds(),
      'GENERAL',
      'Service report submitted',
      this.getService(input.serviceId)?.label ?? input.serviceId,
      '/systems/protocol/reports',
    );
    return { ok: true, id };
  },

  /** Faithful Servant ranking for a month or all attendance. */
  faithfulServantStats(monthKey: string | 'ALL'): Array<{
    personId: string;
    name: string;
    servedCount: number;
    extraCount: number;
    fillInCount: number;
    score: number;
  }> {
    const records =
      monthKey === 'ALL'
        ? [...PROTOCOL_ATTENDANCE]
        : this.attendanceForMonth(monthKey);

    type Acc = {
      servedCount: number;
      extraCount: number;
      fillInCount: number;
      score: number;
    };
    const byPerson = new Map<string, Acc>();

    for (const r of records) {
      const slotKind =
        r.slotKind ?? slotKindFor(r.serviceId, r.personId) ?? 'REGULAR';
      const acc = byPerson.get(r.personId) ?? {
        servedCount: 0,
        extraCount: 0,
        fillInCount: 0,
        score: 0,
      };
      acc.score += scoreAttendanceRow({ status: r.status, slotKind });
      const present =
        r.status === 'PRESENT' || r.status === 'HALF_PRESENT';
      if (present && slotKind !== 'FILL_IN') {
        acc.servedCount += 1;
      }
      if (present && slotKind === 'EXTRA') {
        acc.extraCount += 1;
      }
      if (present && slotKind === 'FILL_IN') {
        acc.fillInCount += 1;
      }
      byPerson.set(r.personId, acc);
    }

    return [...byPerson.entries()]
      .map(([personId, acc]) => ({
        personId,
        name: personName(personId),
        ...acc,
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.servedCount - a.servedCount ||
          a.name.localeCompare(b.name),
      );
  },

  /* ─── Contributions (→ shared Finance fund-protocol) ─── */

  listContributions(filter?: {
    status?: ProtocolContribution['status'];
    personId?: string;
  }): ProtocolContribution[] {
    return PROTOCOL_CONTRIBUTIONS.filter((c) => {
      if (filter?.status && c.status !== filter.status) return false;
      if (filter?.personId && c.personId !== filter.personId) return false;
      return true;
    }).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  },

  submitContribution(input: {
    personId: string;
    amount: number;
    contributionType: ProtocolContributionType;
    paymentMethod: ProtocolPaymentMethod;
    note?: string;
  }): ActionResult & { id?: string } {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { ok: false, reason: 'Amount must be positive' };
    }
    const onRoster = PROTOCOL_ROSTER.some(
      (m) => m.personId === input.personId && m.status !== 'INACTIVE',
    );
    if (!onRoster) {
      return { ok: false, reason: 'Only protocol roster members can contribute' };
    }
    const id = nid('pcon');
    pushProtocolContribution({
      id,
      personId: input.personId,
      amount: Math.round(input.amount),
      contributionType: input.contributionType,
      paymentMethod: input.paymentMethod,
      status: 'PENDING',
      submittedAt: new Date().toISOString(),
      note: input.note,
    });
    logActivity(
      input.personId,
      'CONTRIBUTION_SUBMITTED',
      `Submitted ${input.amount.toLocaleString()} RWF contribution`,
    );
    notifyPeople(
      PROTOCOL_ROSTER.filter((m) => m.office === 'TREASURER').map(
        (m) => m.personId,
      ),
      'CONTRIBUTION_SUBMITTED',
      'New contribution to verify',
      `${personName(input.personId)} · ${input.amount.toLocaleString()} RWF`,
      '/systems/protocol/finance',
    );
    return { ok: true, id };
  },

  verifyContribution(
    contributionId: string,
    actorPersonId: string,
  ): ActionResult {
    const c = PROTOCOL_CONTRIBUTIONS.find((x) => x.id === contributionId);
    if (!c) return { ok: false, reason: 'Unknown contribution' };
    if (c.status !== 'PENDING') {
      return { ok: false, reason: 'Already processed' };
    }
    const posted = financeService.recordProtocolContributionIncome({
      actorPersonId,
      amount: c.amount,
      description: `Protocol contribution · ${personName(c.personId)} · ${c.contributionType}`,
      occurredOn: c.submittedAt.slice(0, 10),
      contributionId: c.id,
    });
    if (!posted.ok) {
      return {
        ok: false,
        reason: posted.reason ?? 'Finance vault denied — need fund grant',
      };
    }
    updateProtocolContribution(c.id, {
      status: 'VERIFIED',
      verifiedAt: new Date().toISOString(),
      verifiedByPersonId: actorPersonId,
      financeTxnId: posted.txnId,
    });
    logActivity(
      actorPersonId,
      'CONTRIBUTION_VERIFIED',
      `Verified ${c.amount.toLocaleString()} RWF from ${personName(c.personId)}`,
    );
    notifyPeople(
      [c.personId],
      'CONTRIBUTION_VERIFIED',
      'Contribution verified',
      `${c.amount.toLocaleString()} RWF posted to Protocol fund`,
      '/systems/protocol/finance',
    );
    return { ok: true };
  },

  async listContributionsHybrid(filter?: {
    status?: ProtocolContribution['status'];
    personId?: string;
  }): Promise<{ rows: ProtocolContribution[]; source: 'api' | 'seed' }> {
    const remote = await listClaimsPreferApi('sys-protocol', {
      mine: Boolean(filter?.personId),
    });
    if (remote) {
      let rows = remote.map((c): ProtocolContribution => {
        const status: ProtocolContribution['status'] =
          c.status === 'CONFIRMED' || c.status === 'PARTIAL'
            ? 'VERIFIED'
            : c.status === 'DECLINED'
              ? 'REJECTED'
              : 'PENDING';
        return {
          id: c.id,
          personId: c.personId,
          amount: c.amount,
          contributionType: (c.typeId as ProtocolContributionType) || 'MONTHLY',
          paymentMethod: c.paymentMethod as ProtocolPaymentMethod,
          status,
          submittedAt: c.submittedAt,
          note: c.note,
          verifiedAt: c.verifiedAt,
          verifiedByPersonId: c.verifiedByPersonId,
          financeTxnId: c.financeTxnId,
        };
      });
      if (filter?.personId) {
        rows = rows.filter((c) => c.personId === filter.personId);
      }
      if (filter?.status) {
        rows = rows.filter((c) => c.status === filter.status);
      }
      return { rows, source: 'api' };
    }
    return { rows: this.listContributions(filter), source: 'seed' };
  },

  async submitContributionHybrid(input: {
    personId: string;
    amount: number;
    contributionType: ProtocolContributionType;
    paymentMethod: ProtocolPaymentMethod;
    note?: string;
  }): Promise<ActionResult & { id?: string }> {
    const api = await submitClaimPreferApi({
      systemId: 'sys-protocol',
      fundId: 'fund-protocol',
      typeLabel: input.contributionType,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      occurredOn: new Date().toISOString().slice(0, 10),
      note: input.note,
    });
    if (api) return api;
    return this.submitContribution(input);
  },

  async verifyContributionHybrid(
    contributionId: string,
    actorPersonId: string,
  ): Promise<ActionResult> {
    const api = await verifyClaimPreferApi({
      contributionId,
      decision: 'CONFIRMED',
    });
    if (api) return api;
    return this.verifyContribution(contributionId, actorPersonId);
  },

  async rejectContributionHybrid(
    contributionId: string,
    actorPersonId: string,
    reason: string,
  ): Promise<ActionResult> {
    const api = await verifyClaimPreferApi({
      contributionId,
      decision: 'DECLINED',
      note: reason,
    });
    if (api) return api;
    return this.rejectContribution(contributionId, actorPersonId, reason);
  },

  rejectContribution(
    contributionId: string,
    actorPersonId: string,
    reason: string,
  ): ActionResult {
    const c = PROTOCOL_CONTRIBUTIONS.find((x) => x.id === contributionId);
    if (!c) return { ok: false, reason: 'Unknown contribution' };
    if (c.status !== 'PENDING') {
      return { ok: false, reason: 'Already processed' };
    }
    const decision = financeService.authorizeFund(
      actorPersonId,
      'fund-protocol',
      'MANAGE',
    );
    if (!decision.allowed) {
      return { ok: false, reason: decision.reason };
    }
    updateProtocolContribution(c.id, {
      status: 'REJECTED',
      verifiedAt: new Date().toISOString(),
      verifiedByPersonId: actorPersonId,
      rejectionReason: reason || 'Rejected by treasurer',
    });
    notifyPeople(
      [c.personId],
      'GENERAL',
      'Contribution rejected',
      reason || 'Contact Protocol Treasurer',
      '/systems/protocol/finance',
    );
    return { ok: true };
  },

  contributionSummary() {
    const rows = PROTOCOL_CONTRIBUTIONS;
    const verified = rows.filter((c) => c.status === 'VERIFIED');
    const pending = rows.filter((c) => c.status === 'PENDING');
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((s, c) => s + c.amount, 0),
      verifiedCount: verified.length,
      verifiedAmount: verified.reduce((s, c) => s + c.amount, 0),
      fundBalance: financeService.balance('fund-protocol'),
    };
  },

  /* ─── Notifications & activity ─── */

  notificationsFor(personId: string): ProtocolNotification[] {
    return PROTOCOL_NOTIFICATIONS.filter((n) => n.personId === personId).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    );
  },

  unreadCount(personId: string): number {
    return PROTOCOL_NOTIFICATIONS.filter(
      (n) => n.personId === personId && !n.read,
    ).length;
  },

  markNotificationRead(id: string) {
    markProtocolNotificationRead(id);
  },

  markAllNotificationsRead(personId: string) {
    markAllProtocolNotificationsRead(personId);
  },

  listActivity(): ProtocolActivityEvent[] {
    return [...PROTOCOL_ACTIVITY];
  },

  /* ─── Reports & export ─── */

  leadershipReport(monthKey: string) {
    const plan = this.getMonthPlan(monthKey);
    const load = this.dutyLoad(monthKey);
    const attendance = this.attendanceSummary(monthKey);
    const presentTotal = attendance.reduce((s, a) => s + a.present, 0);
    const teamTotal = attendance.reduce((s, a) => s + a.teamSize, 0);
    const recordedTotal = attendance.reduce((s, a) => s + a.recorded, 0);
    const contrib = this.contributionSummary();
    const byStatus = {
      PRESENT: 0,
      HALF_PRESENT: 0,
      ABSENT: 0,
      EXCUSED: 0,
    };
    for (const svc of this.servicesForMonth(monthKey)) {
      for (const a of PROTOCOL_ATTENDANCE.filter(
        (r) => r.serviceId === svc.id,
      )) {
        if (a.status in byStatus) {
          byStatus[a.status as keyof typeof byStatus] += 1;
        }
      }
    }
    return {
      monthKey,
      status: plan?.status ?? 'OPEN',
      version: plan?.version ?? 0,
      services: this.servicesForMonth(monthKey).length,
      slots: this.slotsForMonth(monthKey).length,
      dutyLoad: load,
      attendanceByService: attendance,
      attendanceByStatus: byStatus,
      attendanceRate:
        teamTotal === 0 ? null : Math.round((presentTotal / teamTotal) * 100),
      recordedRate:
        teamTotal === 0 ? null : Math.round((recordedTotal / teamTotal) * 100),
      presentTotal,
      teamTotal,
      recordedTotal,
      contributions: contrib,
      faithfulServants: this.faithfulServantStats(monthKey),
    };
  },

  scheduleCsv(monthKey: string): string {
    const lines = [
      'date,kind,label,personId,personName,role,slotKind,source',
    ];
    for (const svc of this.servicesForMonth(monthKey)) {
      const team = this.teamForService(svc.id);
      if (team.length === 0) {
        lines.push(`${svc.date},${svc.kind},"${svc.label}",,,,,`);
        continue;
      }
      for (const slot of team) {
        lines.push(
          `${svc.date},${svc.kind},"${svc.label}",${slot.personId},"${personName(slot.personId)}",${slot.role},${slot.slotKind},${slot.source}`,
        );
      }
    }
    return lines.join('\n');
  },

  attendanceCsv(monthKey: string): string {
    const lines = [
      'date,kind,label,personId,personName,status,slotKind,recordedAt',
    ];
    for (const svc of this.servicesForMonth(monthKey)) {
      const team = this.teamForService(svc.id);
      for (const slot of team) {
        const rec = PROTOCOL_ATTENDANCE.find(
          (a) =>
            a.serviceId === svc.id && a.personId === slot.personId,
        );
        lines.push(
          `${svc.date},${svc.kind},"${svc.label}",${slot.personId},"${personName(slot.personId)}",${rec?.status ?? 'UNRECORDED'},${rec?.slotKind ?? slot.slotKind},${rec?.recordedAt ?? ''}`,
        );
      }
    }
    return lines.join('\n');
  },

  contributionsCsv(): string {
    const lines = [
      'id,personId,personName,amount,type,method,status,submittedAt,verifiedAt,financeTxnId,note',
    ];
    for (const c of this.listContributions()) {
      const note = (c.note ?? '').replaceAll('"', "'");
      lines.push(
        [
          c.id,
          c.personId,
          `"${personName(c.personId)}"`,
          c.amount,
          c.contributionType,
          c.paymentMethod,
          c.status,
          c.submittedAt,
          c.verifiedAt ?? '',
          c.financeTxnId ?? '',
          `"${note}"`,
        ].join(','),
      );
    }
    return lines.join('\n');
  },

  bulletinText(monthKey: string): string {
    const plan = this.getMonthPlan(monthKey);
    const lines = [
      `ADEPR Kacyiru — Protocol Schedule`,
      `Month: ${monthKey} · Status: ${plan?.status ?? 'OPEN'} · v${plan?.version ?? 0}`,
      '',
    ];
    for (const svc of this.servicesForMonth(monthKey)) {
      const names = this.teamForService(svc.id)
        .filter((s) => s.slotKind !== 'FILL_IN')
        .map((s) => {
          const role =
            s.role === 'TEAM_LEADER'
              ? ' (TL)'
              : s.role === 'VICE_LEADER'
                ? ' (VTL)'
                : '';
          return `${personName(s.personId)}${role}`;
        })
        .join(', ');
      lines.push(`${svc.kind} ${svc.date}: ${names || '(unassigned)'}`);
    }
    lines.push('');
    lines.push('Generated for bulletin / print');
    return lines.join('\n');
  },
};
