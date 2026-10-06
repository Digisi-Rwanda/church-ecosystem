import { MEMBERSHIPS, POSITIONS } from '../data/seed';
import {
  PROTOCOL_ABSENCE_REQUESTS,
  PROTOCOL_ACTIVITY,
  PROTOCOL_ATTENDANCE,
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
  pushProtocolFillIn,
  pushProtocolHistory,
  pushProtocolNotification,
  pushProtocolSwap,
  remapProtocolServiceIds,
  replaceProtocolServices,
  replaceProtocolTeamSlots,
  updateProtocolAbsence,
  updateProtocolFillIn,
  updateProtocolMonthPlan,
  updateProtocolSwap,
  upsertProtocolAttendance,
  upsertProtocolRosterMember,
  upsertProtocolServiceReport,
} from '../data/protocolSeed';
import { activeMusicUnits } from '../domain/musicUnits';
import {
  buildProtocolTeams,
  canServeKind,
  choirAllows,
  musicRequirements,
  rankLeaderCandidates,
  validateProtocolTeamsDetailed,
  type ChoirUnitsByPerson,
  type UnitsOnService,
} from '../domain/teamEngine';
import type {
  ProtocolActivityEvent,
  ProtocolIssue,
  ProtocolIssueOverride,
  ProtocolAttendanceRecord,
  ProtocolAttendanceStatus,
  ProtocolMonthPlan,
  ProtocolNotification,
  ProtocolNotificationKind,
  ProtocolOffice,
  ProtocolRosterMember,
  ServeDayCapability,
  ProtocolSchedulingRules,
  ProtocolScheduleVersion,
  ProtocolService,
  ProtocolServiceKind,
  ProtocolSlotKind,
  ProtocolTeamRole,
  ProtocolTeamSlot,
} from '../domain/types';
import { peopleService } from './authService';
import { musicScheduleService } from './musicScheduleService';

const PROTOCOL_KIND_SET = new Set<ProtocolServiceKind>([
  'SS1',
  'SS2',
  'TUESDAY',
  'IGABURO',
]);

function personName(personId: string): string {
  const p = peopleService.getById(personId);
  if (p) return p.preferredName || p.fullName || personId;
  // Not in this browser's people list: use the name saved with the roster.
  const r = PROTOCOL_ROSTER.find((m) => m.personId === personId);
  return r?.displayName || personId;
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

/** Active Protocol office held through a position (President, VP, …). */
function positionOffice(personId: string): ProtocolOffice | null {
  const p = POSITIONS.find(
    (x) =>
      x.personId === personId &&
      x.systemId === 'sys-protocol' &&
      x.status === 'ACTIVE' &&
      x.protocolOffice,
  );
  return p?.protocolOffice ?? null;
}

function positionHolders(offices: ProtocolOffice[]): string[] {
  return POSITIONS.filter(
    (x) =>
      x.systemId === 'sys-protocol' &&
      x.status === 'ACTIVE' &&
      x.protocolOffice &&
      offices.includes(x.protocolOffice),
  ).map((x) => x.personId);
}

/** Presidents: by position, else by roster office. */
function presidentPersonIds(): string[] {
  return [
    ...new Set([
      ...positionHolders(['PRESIDENT']),
      ...PROTOCOL_ROSTER.filter((m) => m.office === 'PRESIDENT').map(
        (m) => m.personId,
      ),
    ]),
  ];
}

/** True while at least one President is in post and available (not on leave). */
function presidentAvailable(): boolean {
  return presidentPersonIds().some((id) => {
    const m = PROTOCOL_ROSTER.find((r) => r.personId === id);
    return !m || m.status === 'ACTIVE';
  });
}

/**
 * Who reviews and publishes a month: the President. The Vice President acts
 * only as delegate, i.e. when no President is available (on leave / vacant).
 */
function reviewerPersonIds(): string[] {
  const out = presidentPersonIds();
  if (!presidentAvailable()) out.push(...positionHolders(['VP']));
  return [...new Set(out)];
}

function leadershipPersonIds(): string[] {
  const offices: ProtocolOffice[] = [
    'PRESIDENT',
    'VP',
    'COORDINATOR',
    'SECRETARY',
    'TREASURER',
  ];
  return [
    ...new Set([
      ...PROTOCOL_ROSTER.filter((m) => offices.includes(m.office)).map(
        (m) => m.personId,
      ),
      ...positionHolders(offices),
    ]),
  ];
}

function coordinatorPersonIds(): string[] {
  return [
    ...new Set([
      ...PROTOCOL_ROSTER.filter(
        (m) => m.office === 'COORDINATOR' && m.status !== 'INACTIVE',
      ).map((m) => m.personId),
      // the Coordinator the church positions name (matches the server)
      ...positionHolders(['COORDINATOR']),
    ]),
  ];
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

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Months Protocol can plan, driven by the clock and by Music:
 *  - the live month and the next one (always, so the coordinator can see that
 *    Music hasn't published yet);
 *  - any later month Music has published;
 *  - any month Protocol already has a plan for (so history stays reachable).
 */
function windowMonths(now: Date): string[] {
  const live = monthKeyOf(now);
  const set = new Set<string>([live, shiftMonth(live, 1)]);
  for (const m of musicScheduleService.plannedMonths()) {
    if (m >= live) set.add(m);
  }
  for (const p of PROTOCOL_MONTH_PLANS) set.add(p.monthKey);
  return [...set].sort();
}

/**
 * Demo bootstrap: only for the live and next month, publish a demo Music
 * schedule if none exists, so a fresh install has something to staff.
 */
export type ProtocolMonthRow = {
  monthKey: string;
  label: string;
  musicState: 'NONE' | 'CONFIRMED' | 'PUBLISHED';
  musicVersion: number;
  batchLabel?: string;
  services: number;
  places: number;
  planStatus: string;
  publishBlockReason?: string;
  /** What happens next for this month. */
  next: 'WAIT_MUSIC' | 'BUILD' | 'SEND' | 'WAIT_PRESIDENT' | 'DONE' | 'NONE';
};

let DEMO_MUSIC = false;
/**
 * Demo/test switch: when on, a month Music has not touched gets a demo Music
 * schedule so a fresh install has something to staff. Off in the real flow —
 * Protocol then waits for Music to confirm.
 */
export function setProtocolDemoMusic(on: boolean) {
  DEMO_MUSIC = on;
}

function ensureDemoMusic(monthKey: string, now = new Date()) {
  const live = monthKeyOf(now);
  if (
    DEMO_MUSIC &&
    (monthKey === live || monthKey === shiftMonth(live, 1)) &&
    // Never shadow a month Music has already confirmed or published.
    musicScheduleService.monthState(monthKey) === 'NONE'
  ) {
    musicScheduleService.ensureDemoPublished(monthKey);
  }
}

/**
 * personId → Music unit ids from choir and Worship-team memberships.
 * Built from the live lineup: a retired choir stops constraining its members,
 * and a newly added one starts to as soon as it has an org unit.
 */
function buildChoirUnitsMap(): ChoirUnitsByPerson {
  const orgToMusic = new Map(
    activeMusicUnits()
      .filter((u) => u.orgUnitId)
      .map((u) => [u.orgUnitId!, u.id] as const),
  );
  const map: ChoirUnitsByPerson = new Map();
  for (const m of MEMBERSHIPS) {
    if (m.systemId !== 'sys-choir' && m.systemId !== 'sys-worship') continue;
    if (!m.orgUnitId) continue;
    if (m.status !== 'ACTIVE') continue;
    const unitId = orgToMusic.get(m.orgUnitId);
    if (!unitId) continue;
    const set = map.get(m.personId) ?? new Set<string>();
    set.add(unitId);
    map.set(m.personId, set);
  }
  // The roster carries each member's choir too (set by the import or the Coordinator).
  const active = new Set(activeMusicUnits().map((u) => u.id));
  for (const r of PROTOCOL_ROSTER) {
    if (!r.choirUnitId || r.status === 'INACTIVE' || !active.has(r.choirUnitId)) continue;
    const set = map.get(r.personId) ?? new Set<string>();
    set.add(r.choirUnitId);
    map.set(r.personId, set);
  }
  return map;
}

/** musicServiceId → unit ids on published Music schedule. */
function buildUnitsOnService(monthKey: string): UnitsOnService {
  const map: UnitsOnService = new Map();
  const published = musicScheduleService.getPlannedForMonth(monthKey);
  if (!published) return map;
  for (const a of published.assignments) {
    const set = map.get(a.serviceId) ?? new Set<string>();
    set.add(a.unitId);
    map.set(a.serviceId, set);
  }
  return map;
}

function protocolServicesFromMusic(monthKey: string) {
  const published = musicScheduleService.getPlannedForMonth(monthKey);
  if (!published) return null;
  return {
    published,
    wanted: published.services.filter(
      (s) =>
        s.periodKey === monthKey &&
        s.kind !== 'FRIDAY' &&
        PROTOCOL_KIND_SET.has(s.kind as ProtocolServiceKind),
    ),
  };
}

function serviceKey(date: string, kind: string): string {
  return `${date}|${kind}`;
}

/**
 * Bring Protocol's service list in line with the published Music schedule,
 * matching by date + kind (not by id), so teams survive a Music republish,
 * legacy random ids, and moved or removed services.
 *
 *  - matched services are re-keyed and keep their teams and target size;
 *  - new Music services are added (draft months only);
 *  - services Music no longer has are dropped with their open work (draft
 *    months only). In a review/published month they are kept so the history
 *    stays intact; the Music-change banner reports them instead.
 */
function syncServicesFromMusic(monthKey: string): ActionResult {
  const src = protocolServicesFromMusic(monthKey);
  if (!src) {
    return {
      ok: false,
      reason: 'Music has not confirmed or published a schedule for this month yet',
    };
  }
  const plan = PROTOCOL_MONTH_PLANS.find((p) => p.monthKey === monthKey);
  const frozen = plan?.status === 'REVIEW' || plan?.status === 'PUBLISHED';
  const existing = PROTOCOL_SERVICES.filter((s) => s.monthKey === monthKey);
  const byKey = new Map(existing.map((s) => [serviceKey(s.date, s.kind), s]));
  const wantedKeys = new Set<string>();
  const idMap = new Map<string, string | null>();
  const next: ProtocolService[] = [];
  let changed = false;

  for (const m of src.wanted) {
    const key = serviceKey(m.date, m.kind);
    wantedKeys.add(key);
    const old = byKey.get(key);
    const newId = `psvc-${m.id}`;
    if (old) {
      if (old.id !== newId) idMap.set(old.id, newId);
      if (
        old.id !== newId ||
        old.musicServiceId !== m.id ||
        old.label !== m.label
      ) {
        changed = true;
      }
      next.push({ ...old, id: newId, musicServiceId: m.id, label: m.label });
    } else if (!frozen) {
      changed = true;
      next.push({
        id: newId,
        monthKey,
        date: m.date,
        kind: m.kind as ProtocolServiceKind,
        label: m.label,
        targetTeamSize: 10,
        musicServiceId: m.id,
      });
    }
  }
  for (const old of existing) {
    if (wantedKeys.has(serviceKey(old.date, old.kind))) continue;
    if (frozen) {
      next.push(old);
    } else {
      idMap.set(old.id, null);
      changed = true;
    }
  }

  if (changed) {
    const others = PROTOCOL_SERVICES.filter((s) => s.monthKey !== monthKey);
    replaceProtocolServices([...others, ...next]);
    remapProtocolServiceIds(idMap);
  }
  return { ok: true };
}

/** date|kind → sorted unit ids, for the services Protocol uses. */
function musicSnapshotFor(
  monthKey: string,
): Record<string, string[]> | null {
  const src = protocolServicesFromMusic(monthKey);
  if (!src) return null;
  const out: Record<string, string[]> = {};
  for (const m of src.wanted) {
    out[serviceKey(m.date, m.kind)] = [
      ...new Set(
        src.published.assignments
          .filter((a) => a.serviceId === m.id)
          .map((a) => a.unitId),
      ),
    ].sort();
  }
  return out;
}

export type ProtocolCoverageRow = {
  serviceId: string;
  label: string;
  date: string;
  kind: string;
  target: number;
  /** Members who could serve under the rules in force now. */
  eligible: number;
  /** Members excluded only because their choir/Worship isn't on this service. */
  blockedByMusic: number;
  /** Members who could serve if the choir rule were not applied. */
  eligibleIfRelaxed: number;
  /** Members who could serve with the rule fully applied. */
  eligibleWithRule: number;
  /** Team size a dry run of the generator would reach (nothing is saved). */
  projected: number;
  /** Same, if the Tuesday choir rule were relaxed. */
  projectedIfTuesdayRelaxed: number;
  short: boolean;
  /** Why it falls short, in plain terms. */
  limitedBy: 'MUSIC' | 'AVAILABILITY' | 'DUTY_CAP' | null;
};

export type ProtocolCoveragePreview = {
  monthKey: string;
  rows: ProtocolCoverageRow[];
  shortRows: ProtocolCoverageRow[];
  tuesdayRelaxed: boolean;
  needDuties: number;
  supplyAtTarget: number;
  supplyAtMax: number;
  notes: string[];
};

export type ProtocolMusicChange = {
  key: string;
  date: string;
  kind: string;
  type: 'ASSIGNMENT' | 'SERVICE_ADDED' | 'SERVICE_REMOVED';
  added: string[];
  removed: string[];
  summary: string;
};

export type ProtocolMusicSync = {
  /** NONE: nothing to compare · UNKNOWN: legacy plan, no baseline · */
  state: 'NONE' | 'UNKNOWN' | 'CURRENT' | 'STALE';
  builtOn?: number;
  current?: number;
  changes: ProtocolMusicChange[];
};

function diffMusicSnapshots(
  before: Record<string, string[]>,
  after: Record<string, string[]>,
): ProtocolMusicChange[] {
  const names = (ids: string[]) =>
    ids.map((id) => musicScheduleService.formatAssignmentLine([id]));
  const out: ProtocolMusicChange[] = [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) {
    const [date, kind] = key.split('|');
    const a = before[key];
    const b = after[key];
    if (a && !b) {
      out.push({
        key,
        date,
        kind,
        type: 'SERVICE_REMOVED',
        added: [],
        removed: names(a),
        summary: `${kind} ${date} is no longer on the Music schedule`,
      });
    } else if (!a && b) {
      out.push({
        key,
        date,
        kind,
        type: 'SERVICE_ADDED',
        added: names(b),
        removed: [],
        summary: `${kind} ${date} was added to the Music schedule`,
      });
    } else if (a && b && a.join('|') !== b.join('|')) {
      const added = b.filter((x) => !a.includes(x));
      const removed = a.filter((x) => !b.includes(x));
      const parts = [
        added.length ? `+ ${names(added).join(', ')}` : '',
        removed.length ? `− ${names(removed).join(', ')}` : '',
      ].filter(Boolean);
      out.push({
        key,
        date,
        kind,
        type: 'ASSIGNMENT',
        added: names(added),
        removed: names(removed),
        summary: `${kind} ${date}: ${parts.join(' · ')}`,
      });
    }
  }
  return out;
}

/** Choir/worship conflicts can be overridden; hard rules cannot. */
function isOverridable(issue: ProtocolIssue): boolean {
  return (
    issue.code === 'CHOIR_NOT_SCHEDULED' ||
    issue.code === 'WORSHIP_NOT_SCHEDULED'
  );
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

/** Scheduling rules for a month, after the Coordinator's relaxations. */
function effectiveRules(monthKey: string): ProtocolSchedulingRules {
  const plan = PROTOCOL_MONTH_PLANS.find((p) => p.monthKey === monthKey);
  return plan?.relaxTuesdayChoirRule
    ? { ...PROTOCOL_RULES, relaxChoirOnKinds: ['TUESDAY'] }
    : PROTOCOL_RULES;
}

function whyNotOnTeam(
  member: ProtocolRosterMember,
  service: ProtocolService,
  personId: string,
  teamPersonIds: Set<string>,
  sameDaySs1: Set<string>,
  choirUnits: ChoirUnitsByPerson,
  unitsOnService: UnitsOnService,
  rules: ProtocolSchedulingRules,
): string | undefined {
  if (member.status !== 'ACTIVE') return 'Member is not ACTIVE';
  if (teamPersonIds.has(personId)) return 'Already on this team';
  if (!canServeKind(member, service.kind, service.date)) {
    return member.onlyServices?.some((x) => x.date.slice(0, 7) === service.date.slice(0, 7))
      ? `Only serves the services picked for this month`
      : `Cannot serve ${service.kind}`;
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
      musicRequirements(rules, service.kind).choir,
      musicRequirements(rules, service.kind).worship,
    )
  ) {
    return 'Choir or Worship team not scheduled on this service (Music)';
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

/**
 * Make sure a service team has a recommended (or chosen) Team Leader and Vice
 * Team Leader. Fills only what is missing, rotating leadership across the month.
 */
function ensureLeadersFor(serviceId: string) {
  const team = staffTeamSlots(serviceId);
  if (team.length === 0) return;
  const service = PROTOCOL_SERVICES.find((x) => x.id === serviceId);
  if (!service) return;
  const roster = new Map(PROTOCOL_ROSTER.map((m) => [m.personId, m]));
  const monthIds = new Set(
    PROTOCOL_SERVICES.filter((x) => x.monthKey === service.monthKey).map((x) => x.id),
  );
  const leadCount = new Map<string, number>();
  for (const sl of PROTOCOL_TEAM_SLOTS) {
    if (!monthIds.has(sl.serviceId) || sl.serviceId === serviceId) continue;
    if (sl.role !== 'MEMBER' || sl.roleStatus === 'RECOMMENDED') {
      if (sl.role !== 'MEMBER' || sl.recommendedRole) {
        leadCount.set(sl.personId, (leadCount.get(sl.personId) ?? 0) + 1);
      }
    }
  }
  const holds = (sl: ProtocolTeamSlot, r: ProtocolTeamRole) =>
    sl.role === r || (sl.recommendedRole === r && sl.roleStatus === 'RECOMMENDED');
  const taken = new Set(
    team
      .filter((sl) => holds(sl, 'TEAM_LEADER') || holds(sl, 'VICE_LEADER'))
      .map((sl) => sl.personId),
  );
  for (const role of ['TEAM_LEADER', 'VICE_LEADER'] as const) {
    if (team.some((sl) => holds(sl, role))) continue;
    const pool = team.map((sl) => sl.personId).filter((id) => !taken.has(id));
    const [best] = rankLeaderCandidates(pool, roster, leadCount);
    if (!best) continue;
    patchTeamSlot(serviceId, best, { recommendedRole: role, roleStatus: 'RECOMMENDED' });
    taken.add(best);
  }
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
  allowedMonths(now = new Date()): string[] {
    return windowMonths(now);
  },

  isAllowedMonth(monthKey: string, now = new Date()): boolean {
    return windowMonths(now).includes(monthKey);
  },

  liveMonthKey(now = new Date()): string {
    const key = monthKeyOf(now);
    ensureDemoMusic(key, now);
    return key;
  },

  rules() {
    return PROTOCOL_RULES;
  },

  listRoster(activeOnly = false): ProtocolRosterMember[] {
    return PROTOCOL_ROSTER.filter((m) =>
      activeOnly ? m.status === 'ACTIVE' : true,
    );
  },

  /* ─── Roster management (Coordinator) ─── */

  /**
   * Add someone to the Protocol roster. They must already be a church person
   * (the id comes from the directory). The Coordinator, President, VP come
   * from the church's positions, so only Member / Secretary / Treasurer here.
   */
  rosterAdd(
    input: {
      personId: string;
      displayName?: string;
      email?: string;
      office?: Extract<ProtocolOffice, 'MEMBER' | 'SECRETARY' | 'TREASURER'>;
      serveDays?: ServeDayCapability;
      notes?: string;
    },
    actorPersonId: string,
  ): ActionResult & { id?: string } {
    if (!this.isCoordinator(actorPersonId)) {
      return { ok: false, reason: 'Only the Coordinator manages the roster' };
    }
    const existing = PROTOCOL_ROSTER.find((m) => m.personId === input.personId);
    if (existing) {
      if (existing.status !== 'INACTIVE') {
        return { ok: false, reason: 'Already on the Protocol roster' };
      }
      upsertProtocolRosterMember({ ...existing, status: 'ACTIVE' });
      logActivity(actorPersonId, 'GENERAL', `Reactivated ${personName(input.personId)} on the roster`);
      return { ok: true, id: existing.id };
    }
    const row: ProtocolRosterMember = {
      id: nid('prm'),
      personId: input.personId,
      office: input.office ?? 'MEMBER',
      serveDays: input.serveDays ?? 'BOTH',
      status: 'ACTIVE',
      unavailableDates: [],
      notes: input.notes?.trim() || undefined,
      displayName: input.displayName?.trim() || undefined,
      email: input.email?.trim() || undefined,
    };
    upsertProtocolRosterMember(row);
    logActivity(actorPersonId, 'GENERAL', `Added ${personName(input.personId)} to the roster`);
    return { ok: true, id: row.id };
  },

  rosterUpdate(
    rosterId: string,
    patch: Partial<
      Pick<
        ProtocolRosterMember,
        'office' | 'serveDays' | 'status' | 'unavailableDates' | 'notes' | 'allowedServiceKinds' | 'onlyServices' | 'choirUnitId'
      >
    >,
    actorPersonId: string,
  ): ActionResult {
    if (!this.isCoordinator(actorPersonId)) {
      return { ok: false, reason: 'Only the Coordinator manages the roster' };
    }
    const row = PROTOCOL_ROSTER.find((m) => m.id === rosterId);
    if (!row) return { ok: false, reason: 'Not on the roster' };
    const next: ProtocolRosterMember = { ...row };
    if (patch.office !== undefined && patch.office !== row.office) {
      const settable = ['MEMBER', 'SECRETARY', 'TREASURER'];
      if (!settable.includes(patch.office) || !settable.includes(row.office)) {
        return {
          ok: false,
          reason: 'Coordinator, President and Vice President come from the church positions',
        };
      }
      next.office = patch.office;
    }
    if (
      patch.serveDays !== undefined &&
      patch.serveDays !== row.serveDays &&
      patch.allowedServiceKinds === undefined
    ) {
      next.serveDays = patch.serveDays;
      next.allowedServiceKinds =
        patch.serveDays === 'TUESDAY' ? ['TUESDAY'] : undefined;
    }
    if (patch.allowedServiceKinds !== undefined) {
      const all: ProtocolServiceKind[] = ['SS1', 'SS2', 'TUESDAY', 'IGABURO'];
      const kinds = [...new Set(patch.allowedServiceKinds)].filter((k) => all.includes(k));
      if (kinds.length === 0) {
        return {
          ok: false,
          reason: 'Pick at least one service, or set the member on leave or inactive instead',
        };
      }
      if (kinds.length === all.length) {
        // Every service: no special limit, back to the plain serve-days rule.
        next.allowedServiceKinds = undefined;
        next.serveDays = 'BOTH';
      } else {
        next.allowedServiceKinds = kinds;
        const tue = kinds.includes('TUESDAY');
        const sun = kinds.some((k) => k !== 'TUESDAY');
        next.serveDays = tue && sun ? 'BOTH' : tue ? 'TUESDAY' : 'SUNDAY';
      }
    }
    if (patch.status !== undefined) {
      if (row.office === 'COORDINATOR' && patch.status === 'INACTIVE') {
        return { ok: false, reason: 'The Coordinator cannot be deactivated from the roster' };
      }
      next.status = patch.status;
    }
    if (patch.unavailableDates !== undefined) {
      const bad = patch.unavailableDates.find((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
      if (bad) return { ok: false, reason: `"${bad}" is not a date (use YYYY-MM-DD)` };
      next.unavailableDates = [...new Set(patch.unavailableDates)].sort();
    }
    if (patch.onlyServices !== undefined) {
      const ok: ProtocolServiceKind[] = ['SS1', 'SS2', 'TUESDAY', 'IGABURO'];
      const bad = patch.onlyServices.find(
        (x) => !/^\d{4}-\d{2}-\d{2}$/.test(x.date) || !ok.includes(x.kind),
      );
      if (bad) return { ok: false, reason: `"${bad.date} ${bad.kind}" is not a valid service` };
      const seen = new Set<string>();
      const list = patch.onlyServices
        .filter((x) => !seen.has(`${x.date}|${x.kind}`) && seen.add(`${x.date}|${x.kind}`))
        .sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
      next.onlyServices = list.length ? list : undefined;
    }
    if (patch.choirUnitId !== undefined) {
      if (patch.choirUnitId && !activeMusicUnits().some((u) => u.id === patch.choirUnitId)) {
        return { ok: false, reason: 'That choir is not on the Music list' };
      }
      next.choirUnitId = patch.choirUnitId || undefined;
    }
    if (patch.notes !== undefined) next.notes = patch.notes.trim() || undefined;
    upsertProtocolRosterMember(next);
    logActivity(actorPersonId, 'GENERAL', `Updated roster entry for ${personName(row.personId)}`);
    return { ok: true };
  },

  rosterWithNames(activeOnly = false) {
    return this.listRoster(activeOnly).map((m) => ({
      ...m,
      name: personName(m.personId),
    }));
  },

  /**
   * Protocol office of a person: the office their position gives them
   * (President, VP, Coordinator…), else their roster office. Church-level
   * leadership gives no Protocol office.
   */
  officeFor(personId: string): ProtocolOffice | null {
    const fromPosition = positionOffice(personId);
    if (fromPosition) return fromPosition;
    const m = PROTOCOL_ROSTER.find(
      (r) => r.personId === personId && r.status !== 'INACTIVE',
    );
    return m?.office ?? null;
  },

  isCoordinator(personId: string): boolean {
    return this.officeFor(personId) === 'COORDINATOR';
  },

  /**
   * The President reviews and publishes. The Vice President only when the
   * President is unavailable (delegation).
   */
  isReviewer(personId: string): boolean {
    return reviewerPersonIds().includes(personId);
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
    // Always reconcile with Music (by date + kind): cheap, and a no-op unless
    // something actually changed.
    if (musicScheduleService.getPlannedForMonth(monthKey)) {
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
  generateTeams(monthKey: string, actorPersonId: string): {
    ok: boolean;
    reason?: string;
    warnings: string[];
    slotCount: number;
  } {
    if (!this.isCoordinator(actorPersonId)) {
      return {
        ok: false,
        reason: 'Only the Coordinator can build the teams',
        warnings: [],
        slotCount: 0,
      };
    }
    if (
      !this.isAllowedMonth(monthKey) ||
      monthKey < monthKeyOf(new Date())
    ) {
      return {
        ok: false,
        reason:
          'Only the live month, the next month, or a month Music has published can be scheduled',
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
    const published = musicScheduleService.getPlannedForMonth(monthKey);
    if (!published) {
      return {
        ok: false,
        reason: 'Music has not confirmed or published a schedule for this month yet',
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
      rules: effectiveRules(monthKey),
      choirUnits,
      unitsOnService,
    });

    const otherSlots = PROTOCOL_TEAM_SLOTS.filter((s) => {
      const svc = PROTOCOL_SERVICES.find((x) => x.id === s.serviceId);
      return svc && svc.monthKey !== monthKey;
    });
    replaceProtocolTeamSlots([...otherSlots, ...slots]);

    const issues = validateProtocolTeamsDetailed({
      services,
      roster: PROTOCOL_ROSTER,
      slots,
      rules: effectiveRules(monthKey),
      choirUnits,
      unitsOnService,
    }).map((i) => i.message);

    updateProtocolMonthPlan(monthKey, {
      status: 'DRAFT',
      generatedAt: new Date().toISOString(),
      validationNotes: [...warnings, ...issues],
      submittedForReviewAt: undefined,
      submittedByPersonId: undefined,
      reviewedAt: undefined,
      reviewedByPersonId: undefined,
      // New baseline: these teams were built against this Music schedule.
      musicVersionBuiltOn: published.version,
      musicSnapshot: musicSnapshotFor(monthKey) ?? undefined,
      musicStaleNotified: false,
      // Rebuilt teams → earlier exceptions no longer apply.
      overrides: [],
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

  /** Message-only view (kept for existing callers). */
  validateMonth(monthKey: string): string[] {
    return this.validateMonthDetailed(monthKey).issues.map((i) => i.message);
  },

  /**
   * Structured validation for a month.
   *  - blocking: rule violations with no override yet — stop submit/publish;
   *  - overridden: blocking issues a coordinator accepted (with the reason);
   *  - warnings: quality notes that never block.
   */
  validateMonthDetailed(monthKey: string): {
    issues: ProtocolIssue[];
    blocking: ProtocolIssue[];
    overridden: Array<{ issue: ProtocolIssue; override: ProtocolIssueOverride }>;
    warnings: ProtocolIssue[];
  } {
    const issues = validateProtocolTeamsDetailed({
      services: this.servicesForMonth(monthKey),
      roster: PROTOCOL_ROSTER,
      slots: this.slotsForMonth(monthKey),
      rules: effectiveRules(monthKey),
      choirUnits: buildChoirUnitsMap(),
      unitsOnService: buildUnitsOnService(monthKey),
    });
    const overrides = new Map(
      (this.getMonthPlan(monthKey)?.overrides ?? []).map((o) => [
        o.issueKey,
        o,
      ]),
    );
    const blocking: ProtocolIssue[] = [];
    const overridden: Array<{
      issue: ProtocolIssue;
      override: ProtocolIssueOverride;
    }> = [];
    for (const i of issues) {
      if (i.severity !== 'BLOCKING') continue;
      const o = isOverridable(i) ? overrides.get(i.key) : undefined;
      if (o) overridden.push({ issue: i, override: o });
      else blocking.push(i);
    }
    return {
      issues,
      blocking,
      overridden,
      warnings: issues.filter((i) => i.severity === 'WARNING'),
    };
  },

  isOverridable(issue: ProtocolIssue): boolean {
    return isOverridable(issue);
  },

  /**
   * Coordinator accepts a choir/Worship conflict, with a written reason.
   * Hard rules (double Sunday, inactive, over the monthly max…) cannot be
   * overridden.
   */
  overrideIssue(
    monthKey: string,
    issueKey: string,
    reason: string,
    actorPersonId: string,
  ): ActionResult {
    if (this.officeFor(actorPersonId) !== 'COORDINATOR') {
      return { ok: false, reason: 'Only the Coordinator can override an issue' };
    }
    const plan = this.getMonthPlan(monthKey);
    if (!plan) return { ok: false, reason: 'Generate teams for this month first' };
    if (plan.status === 'PUBLISHED') {
      return {
        ok: false,
        reason: 'Month is published — reopen to DRAFT before overriding',
      };
    }
    const text = reason.trim();
    if (text.length < 5) {
      return { ok: false, reason: 'Give a reason (at least a few words)' };
    }
    const issue = this.validateMonthDetailed(monthKey).issues.find(
      (i) => i.key === issueKey,
    );
    if (!issue) return { ok: false, reason: 'That issue no longer applies' };
    if (!isOverridable(issue)) {
      return { ok: false, reason: 'This rule cannot be overridden' };
    }
    const next: ProtocolIssueOverride[] = [
      ...(plan.overrides ?? []).filter((o) => o.issueKey !== issueKey),
      {
        issueKey,
        reason: text,
        byPersonId: actorPersonId,
        at: new Date().toISOString(),
      },
    ];
    updateProtocolMonthPlan(monthKey, { overrides: next });
    logActivity(
      actorPersonId,
      'GENERAL',
      `Override (${monthKey}): ${issue.message} — ${text}`,
    );
    return { ok: true };
  },

  clearOverride(
    monthKey: string,
    issueKey: string,
    actorPersonId: string,
  ): ActionResult {
    if (this.officeFor(actorPersonId) !== 'COORDINATOR') {
      return { ok: false, reason: 'Only the Coordinator can change overrides' };
    }
    const plan = this.getMonthPlan(monthKey);
    if (!plan) return { ok: false, reason: 'Unknown month' };
    if (plan.status === 'PUBLISHED') {
      return { ok: false, reason: 'Month is published — reopen to DRAFT first' };
    }
    updateProtocolMonthPlan(monthKey, {
      overrides: (plan.overrides ?? []).filter((o) => o.issueKey !== issueKey),
    });
    return { ok: true };
  },

  /**
   * Coordinator relaxes (or restores) the choir/Worship-on-service rule for
   * Tuesdays this month, with a written reason. Takes effect on the next
   * Generate; the reason is stored and shown at review and in history.
   */
  setTuesdayChoirRelaxed(
    monthKey: string,
    relaxed: boolean,
    reason: string,
    actorPersonId: string,
  ): ActionResult {
    if (!this.isCoordinator(actorPersonId)) {
      return {
        ok: false,
        reason: 'Only the Coordinator can relax a scheduling rule',
      };
    }
    if (!this.isAllowedMonth(monthKey)) {
      return { ok: false, reason: 'That month cannot be scheduled' };
    }
    const plan = this.getMonthPlan(monthKey);
    if (plan?.status === 'PUBLISHED' || plan?.status === 'REVIEW') {
      return {
        ok: false,
        reason: 'Return the month to draft before changing a rule',
      };
    }
    const text = reason.trim();
    if (relaxed && text.length < 5) {
      return { ok: false, reason: 'Give a reason (at least a few words)' };
    }
    updateProtocolMonthPlan(monthKey, {
      relaxTuesdayChoirRule: relaxed,
      relaxReason: relaxed ? text : undefined,
      relaxedByPersonId: relaxed ? actorPersonId : undefined,
      relaxedAt: relaxed ? new Date().toISOString() : undefined,
    });
    logActivity(
      actorPersonId,
      'GENERAL',
      relaxed
        ? `Relaxed the Tuesday choir rule for ${monthKey} — ${text}`
        : `Restored the Tuesday choir rule for ${monthKey}`,
    );
    return { ok: true };
  },

  /**
   * Before generating: can each service be staffed? Counts, per service, who
   * could serve under the rules (serve days, availability, choir/Worship on
   * service) against the team size, and what the Tuesday relaxation would add.
   */
  coveragePreview(monthKey: string): ProtocolCoveragePreview {
    const services = this.servicesForMonth(monthKey);
    const rules = effectiveRules(monthKey);
    const choirUnits = buildChoirUnitsMap();
    const unitsOnService = buildUnitsOnService(monthKey);
    const active = PROTOCOL_ROSTER.filter((m) => m.status === 'ACTIVE');
    // Dry runs of the real generator — nothing is saved.
    const sizes = (r: ProtocolSchedulingRules) => {
      const counts = new Map<string, number>();
      for (const slot of buildProtocolTeams({
        services,
        roster: PROTOCOL_ROSTER,
        rules: r,
        choirUnits,
        unitsOnService,
      }).slots) {
        counts.set(slot.serviceId, (counts.get(slot.serviceId) ?? 0) + 1);
      }
      return counts;
    };
    const projectedNow = sizes(rules);
    const projectedRelaxed = sizes({
      ...rules,
      relaxChoirOnKinds: ['TUESDAY'],
    });
    const rows: ProtocolCoverageRow[] = services.map((service) => {
      const target = service.targetTeamSize || PROTOCOL_RULES.defaultTeamSize;
      const req = musicRequirements(rules, service.kind);
      const base = active.filter(
        (m) =>
          canServeKind(m, service.kind, service.date) &&
          !m.unavailableDates.includes(service.date),
      );
      const eligible = base.filter((m) =>
        choirAllows(m, service, choirUnits, unitsOnService, req.choir, req.worship),
      );
      const ifRule = base.filter((m) =>
        choirAllows(
          m,
          service,
          choirUnits,
          unitsOnService,
          PROTOCOL_RULES.requireChoirOnService,
          PROTOCOL_RULES.requireWorshipOnService ??
            PROTOCOL_RULES.requireChoirOnService,
        ),
      );
      return {
        serviceId: service.id,
        label: service.label,
        date: service.date,
        kind: service.kind,
        target,
        eligible: eligible.length,
        blockedByMusic: base.length - eligible.length,
        eligibleIfRelaxed: base.length,
        eligibleWithRule: ifRule.length,
        projected: projectedNow.get(service.id) ?? 0,
        projectedIfTuesdayRelaxed: projectedRelaxed.get(service.id) ?? 0,
        short: (projectedNow.get(service.id) ?? 0) < target,
        limitedBy:
          eligible.length < target
            ? base.length >= target
              ? 'MUSIC'
              : 'AVAILABILITY'
            : (projectedNow.get(service.id) ?? 0) < target
              ? 'DUTY_CAP'
              : null,
      };
    });
    const need = rows.reduce((n, r) => n + r.target, 0);
    const supplyAtTarget = active.length * PROTOCOL_RULES.preferTarget;
    const supplyAtMax = active.length * PROTOCOL_RULES.hardMax;
    const notes: string[] = [];
    if (need > supplyAtMax) {
      notes.push(
        `Not enough people: ${need} duties are needed but ${active.length} active members can give at most ${supplyAtMax}.`,
      );
    } else if (need > supplyAtTarget) {
      notes.push(
        `${need} duties are needed but the target (${PROTOCOL_RULES.preferTarget} each) gives ${supplyAtTarget} — some members will get a 4th (Extra) duty.`,
      );
    }
    return {
      monthKey,
      rows,
      shortRows: rows.filter((r) => r.short),
      tuesdayRelaxed: !!this.getMonthPlan(monthKey)?.relaxTuesdayChoirRule,
      needDuties: need,
      supplyAtTarget,
      supplyAtMax,
      notes,
    };
  },

  /**
   * Has the Music schedule changed since these teams were built?
   * Compares the Music assignments of the services Protocol uses against the
   * snapshot taken when teams were generated.
   */
  musicSync(monthKey: string): ProtocolMusicSync {
    const plan = this.getMonthPlan(monthKey);
    const published = musicScheduleService.getPlannedForMonth(monthKey);
    if (!plan || !published) return { state: 'NONE', changes: [] };
    // Reconcile first so a republish is reflected in service ids.
    syncServicesFromMusic(monthKey);
    if (!plan.musicSnapshot) {
      return { state: 'UNKNOWN', current: published.version, changes: [] };
    }
    const now = musicSnapshotFor(monthKey) ?? {};
    const changes = diffMusicSnapshots(plan.musicSnapshot, now);
    return {
      state: changes.length > 0 ? 'STALE' : 'CURRENT',
      builtOn: plan.musicVersionBuiltOn,
      current: published.version,
      changes,
    };
  },

  /**
   * Coordinator confirms the Music changes were looked at: the baseline moves
   * to the current Music schedule. Conflicts the change caused still show up
   * as blocking issues, so this never hides a real problem.
   */
  acknowledgeMusicChange(monthKey: string, actorPersonId: string): ActionResult {
    if (
      !this.isCoordinator(actorPersonId) &&
      !this.isReviewer(actorPersonId)
    ) {
      return {
        ok: false,
        reason: 'Only the Coordinator or the Protocol President can review Music changes',
      };
    }
    const plan = this.getMonthPlan(monthKey);
    if (!plan) return { ok: false, reason: 'Unknown month' };
    const published = musicScheduleService.getPlannedForMonth(monthKey);
    if (!published) {
      return { ok: false, reason: 'No Music schedule for this month' };
    }
    const sync = this.musicSync(monthKey);
    updateProtocolMonthPlan(monthKey, {
      musicVersionBuiltOn: published.version,
      musicSnapshot: musicSnapshotFor(monthKey) ?? undefined,
      musicStaleNotified: false,
      validationNotes: this.validateMonth(monthKey),
    });
    logActivity(
      actorPersonId,
      'MUSIC_CHANGED',
      `Reviewed Music changes for ${monthKey} (${sync.changes.length} change${sync.changes.length === 1 ? '' : 's'})`,
    );
    return { ok: true };
  },

  /** Why submit/publish must wait, or undefined when clear to go. */
  /** "Oct 2026 · Music confirmed" — what the month pickers show. */
  /**
   * One row per month Protocol can act on: Music state, teams, review, publish.
   * Months from the live month on that Music has confirmed/published, plus any
   * month Protocol already planned.
   */
  monthsOverview(now = new Date()): ProtocolMonthRow[] {
    const live = monthKeyOf(now);
    const months = new Set<string>();
    for (const m of musicScheduleService.plannedMonths()) if (m >= live) months.add(m);
    for (const p of PROTOCOL_MONTH_PLANS) months.add(p.monthKey);
    return [...months].sort().map((monthKey) => {
      const music = musicScheduleService.monthState(monthKey);
      const view = musicScheduleService.getPlannedForMonth(monthKey);
      const plan = this.getMonthPlan(monthKey);
      const svcs = this.servicesForMonth(monthKey);
      const places = svcs.reduce((n, s) => n + this.teamForService(s.id).length, 0);
      const status = plan?.status ?? 'OPEN';
      const batch =
        musicScheduleService.listBatches().find((b) => b.months.some((x) => x.month === monthKey)) ?? null;
      let next: ProtocolMonthRow['next'] = 'NONE';
      if (music === 'NONE') next = 'WAIT_MUSIC';
      else if (status === 'PUBLISHED') next = 'DONE';
      else if (status === 'REVIEW') next = 'WAIT_PRESIDENT';
      else if (places === 0) next = 'BUILD';
      else next = 'SEND';
      return {
        monthKey,
        label: this.monthLabel(monthKey).split(' · ')[0]!,
        musicState: music,
        musicVersion: view?.version ?? 0,
        batchLabel: batch ? `${batch.horizon.toLowerCase()} batch` : undefined,
        services: svcs.length,
        places,
        planStatus: status,
        publishBlockReason: this.publishBlockReason(monthKey),
        next,
      };
    });
  },

  /** First month that needs the Coordinator (to build or send), else the live month. */
  firstActionMonth(now = new Date()): string {
    const row = this.monthsOverview(now).find(
      (r) => r.next === 'BUILD' || r.next === 'SEND',
    );
    return row?.monthKey ?? monthKeyOf(now);
  },

  /** Build teams for every confirmed/published month that has none yet. */
  buildAllReady(actorPersonId: string): {
    ok: boolean;
    reason?: string;
    built: string[];
    failed: { monthKey: string; reason: string }[];
  } {
    if (!this.isCoordinator(actorPersonId)) {
      return { ok: false, reason: 'Only the Coordinator can build the teams', built: [], failed: [] };
    }
    const built: string[] = [];
    const failed: { monthKey: string; reason: string }[] = [];
    for (const row of this.monthsOverview().filter((r) => r.next === 'BUILD')) {
      const r = this.generateTeams(row.monthKey, actorPersonId);
      if (r.ok) built.push(row.monthKey);
      else failed.push({ monthKey: row.monthKey, reason: r.reason ?? 'Failed' });
    }
    return { ok: true, built, failed };
  },

  monthLabel(monthKey: string): string {
    ensureDemoMusic(monthKey);
    const [y, m] = monthKey.split('-').map(Number);
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const st = musicScheduleService.monthState(monthKey);
    const tag =
      st === 'PUBLISHED'
        ? 'Music published'
        : st === 'CONFIRMED'
          ? 'Music confirmed'
          : 'no Music schedule';
    return `${names[m - 1]} ${y} · ${tag}`;
  },

  /** Where the month stands on the Music side: NONE, CONFIRMED (locked, not released) or PUBLISHED. */
  musicState(monthKey: string): 'NONE' | 'CONFIRMED' | 'PUBLISHED' {
    return musicScheduleService.monthState(monthKey);
  },

  /**
   * Protocol never goes out ahead of the choirs: a month Music has only
   * confirmed can be planned, reviewed and approved, but not published.
   */
  publishBlockReason(monthKey: string): string | undefined {
    const st = this.musicState(monthKey);
    if (st === 'PUBLISHED') return undefined;
    return st === 'CONFIRMED'
      ? `Music has confirmed ${monthKey} but not published it to the choirs yet. Protocol can publish once Music does.`
      : `Music has no schedule for ${monthKey} yet.`;
  },

  gateReason(monthKey: string): string | undefined {
    const sync = this.musicSync(monthKey);
    if (sync.state === 'STALE') {
      return `Music schedule changed since these teams were built (v${sync.builtOn ?? '?'} → v${sync.current ?? '?'}) — review the changes first`;
    }
    const v = this.validateMonthDetailed(monthKey);
    if (v.blocking.length > 0) {
      const more =
        v.blocking.length > 1 ? ` (+${v.blocking.length - 1} more)` : '';
      // Hard rules first: they can't be overridden, so they are what to fix.
      const first = v.blocking.find((i) => !isOverridable(i)) ?? v.blocking[0];
      return first.message.length
        ? `${first.message}${more} — ${
            isOverridable(first)
              ? 'fix it, or ask the Coordinator to override with a reason'
              : 'this rule cannot be overridden, fix it'
          }`
        : 'Blocking issues remain';
    }
    return undefined;
  },

  submitForReview(monthKey: string, actorPersonId: string): ActionResult {
    if (!this.isCoordinator(actorPersonId)) {
      return {
        ok: false,
        reason: 'Only the Coordinator can submit a month for review',
      };
    }
    let plan = this.getMonthPlan(monthKey);
    if (!plan && this.slotsForMonth(monthKey).length > 0) {
      updateProtocolMonthPlan(monthKey, { status: 'DRAFT' });
      plan = this.getMonthPlan(monthKey);
    }
    if (!plan) return { ok: false, reason: 'Generate teams for this month first' };
    if (plan.status !== 'DRAFT' && plan.status !== 'OPEN') {
      return { ok: false, reason: 'Only draft months can be submitted' };
    }
    if (plan.status === 'OPEN') {
      updateProtocolMonthPlan(monthKey, { status: 'DRAFT' });
    }
    if (this.slotsForMonth(monthKey).length === 0) {
      return { ok: false, reason: 'Generate teams before submitting' };
    }
    const gate = this.gateReason(monthKey);
    if (gate) return { ok: false, reason: gate };
    const issues = this.validateMonth(monthKey);
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
      reviewerPersonIds(),
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
    const denied = this.reviewerDenied(plan, actorPersonId, 'review');
    if (denied) return { ok: false, reason: denied };
    updateProtocolMonthPlan(monthKey, {
      reviewedAt: new Date().toISOString(),
      reviewedByPersonId: actorPersonId,
    });
    return { ok: true };
  },

  /**
   * Reviewers (President/VP) are the only ones who may review or publish, and
   * never the person who submitted the month.
   */
  reviewerDenied(
    plan: ProtocolMonthPlan,
    actorPersonId: string,
    verb: 'review' | 'publish',
  ): string | undefined {
    if (!this.isReviewer(actorPersonId)) {
      return `Only the Protocol President (or the Vice President when delegated) can ${verb} a month`;
    }
    if (plan.submittedByPersonId === actorPersonId) {
      return `You submitted this month — someone else must ${verb} it`;
    }
    return undefined;
  },

  /**
   * Send a month back to draft.
   *  - From REVIEW: the Coordinator can withdraw it, or the President/VP can
   *    send it back.
   *  - From PUBLISHED: only the President/VP can reopen it.
   */
  returnToDraft(monthKey: string, actorPersonId: string): ActionResult {
    const plan = this.getMonthPlan(monthKey);
    if (!plan) return { ok: false, reason: 'Unknown month' };
    if (plan.status !== 'REVIEW' && plan.status !== 'PUBLISHED') {
      return { ok: false, reason: 'Nothing to reopen' };
    }
    const reviewer = this.isReviewer(actorPersonId);
    const coordinator = this.isCoordinator(actorPersonId);
    if (plan.status === 'PUBLISHED' && !reviewer) {
      return {
        ok: false,
        reason: 'Only the Protocol President (or the Vice President when delegated) can reopen a published month',
      };
    }
    if (plan.status === 'REVIEW' && !reviewer && !coordinator) {
      return {
        ok: false,
        reason: 'Only the Coordinator or the President can send this month back',
      };
    }
    updateProtocolMonthPlan(monthKey, {
      status: 'DRAFT',
      reviewedAt: undefined,
      reviewedByPersonId: undefined,
      publishedAt: undefined,
      publishedByPersonId: undefined,
    });
    logActivity(
      actorPersonId,
      'GENERAL',
      `${plan.status === 'PUBLISHED' ? 'Reopened' : 'Returned to draft'} ${monthKey}`,
    );
    if (!coordinator) {
      notifyPeople(
        coordinatorPersonIds(),
        'GENERAL',
        `${monthKey} returned to draft`,
        `${personName(actorPersonId)} sent the month back for changes`,
        '/systems/protocol/teams',
      );
    }
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
    const denied = this.reviewerDenied(plan, actorPersonId, 'publish');
    if (denied) return { ok: false, reason: denied };
    const gate = this.gateReason(monthKey);
    if (gate) return { ok: false, reason: gate };
    const early = this.publishBlockReason(monthKey);
    if (early) return { ok: false, reason: early };
    if (!plan.reviewedByPersonId) {
      updateProtocolMonthPlan(monthKey, {
        reviewedAt: new Date().toISOString(),
        reviewedByPersonId: actorPersonId,
      });
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
      validationNotes: [
        ...plan.validationNotes,
        ...(plan.relaxTuesdayChoirRule
          ? [
              `Rule relaxed: Tuesday choir rule — ${plan.relaxReason ?? ''} (${plan.relaxedByPersonId ? personName(plan.relaxedByPersonId) : 'Coordinator'})`,
            ]
          : []),
        ...this.validateMonthDetailed(monthKey).overridden.map(
          ({ issue, override }) =>
            `Override: ${issue.message} — ${override.reason} (${personName(override.byPersonId)})`,
        ),
      ],
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
          effectiveRules(service.monthKey),
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
      effectiveRules(service.monthKey),
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
    ensureLeadersFor(serviceId);
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
    const slot = team.find((s) => s.personId === personId);
    if (!slot) return { ok: false, reason: 'Person is not on this team' };
    replaceProtocolTeamSlots(
      PROTOCOL_TEAM_SLOTS.filter((s) => s.id !== slot.id),
    );
    ensureLeadersFor(serviceId);
    logActivity(
      actorPersonId,
      'GENERAL',
      `Removed ${personName(personId)} from ${service.label}`,
    );
    const target = service.targetTeamSize || PROTOCOL_RULES.defaultTeamSize;
    return {
      ok: true,
      ...(team.length - 1 < target
        ? { reason: `Team is now ${team.length - 1}/${target}. Add or replace someone before sending for review.` }
        : {}),
    };
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
      effectiveRules(service.monthKey),
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
    ensureLeadersFor(serviceId);
    logActivity(
      actorPersonId,
      'GENERAL',
      `Replaced ${personName(fromPersonId)} with ${personName(toPersonId)} on ${service.label}`,
    );
    return { ok: true };
  },

  /** Make sure the team has a TL and VTL (recommended if not chosen). */
  ensureLeaders(serviceId: string): void {
    const service = this.getService(serviceId);
    if (!service || !assertTeamsEditable(service.monthKey).ok) return;
    ensureLeadersFor(serviceId);
  },

  /** Who leads a service team now: chosen, else recommended. */
  leadersOf(serviceId: string): {
    teamLeader?: { personId: string; status: 'APPROVED' | 'RECOMMENDED' };
    viceLeader?: { personId: string; status: 'APPROVED' | 'RECOMMENDED' };
  } {
    const team = staffTeamSlots(serviceId);
    const pick = (role: ProtocolTeamRole) => {
      const chosen = team.find(
        (s) => s.role === role && (s.roleStatus === 'APPROVED' || s.roleStatus === 'MANUAL'),
      );
      if (chosen) return { personId: chosen.personId, status: 'APPROVED' as const };
      const rec = team.find(
        (s) => s.recommendedRole === role && s.roleStatus === 'RECOMMENDED',
      );
      return rec ? { personId: rec.personId, status: 'RECOMMENDED' as const } : undefined;
    };
    return { teamLeader: pick('TEAM_LEADER'), viceLeader: pick('VICE_LEADER') };
  },

  /** Coordinator approves the recommended TL and VTL of a service in one go. */
  approveLeaders(serviceId: string, actorPersonId: string): ActionResult & { approved?: number } {
    if (!this.isCoordinator(actorPersonId)) {
      return { ok: false, reason: 'Only the Coordinator approves team leaders' };
    }
    const service = this.getService(serviceId);
    if (!service) return { ok: false, reason: 'Unknown service' };
    const editable = assertTeamsEditable(service.monthKey);
    if (!editable.ok) return editable;
    ensureLeadersFor(serviceId);
    let approved = 0;
    for (const sl of staffTeamSlots(serviceId)) {
      if (sl.roleStatus === 'RECOMMENDED' && sl.recommendedRole && sl.recommendedRole !== 'MEMBER') {
        if (this.approveTeamRole(serviceId, sl.personId, actorPersonId).ok) approved += 1;
      }
    }
    return { ok: true, approved };
  },

  /** One person's participation: this month's duties, load and record. */
  personParticipation(personId: string, monthKey: string) {
    const services = this.servicesForMonth(monthKey);
    const duties = services
      .map((svc) => {
        const slot = PROTOCOL_TEAM_SLOTS.find(
          (x) => x.serviceId === svc.id && x.personId === personId,
        );
        if (!slot) return null;
        const att = PROTOCOL_ATTENDANCE.find(
          (a) => a.serviceId === svc.id && a.personId === personId,
        );
        return {
          serviceId: svc.id,
          date: svc.date,
          kind: svc.kind,
          slotKind: slot.slotKind,
          role: slot.role,
          roleStatus: slot.roleStatus,
          attendance: att?.status,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const official = duties.filter((d) => d.slotKind === 'REGULAR').length;
    const records = PROTOCOL_ATTENDANCE.filter((a) => a.personId === personId);
    const requests = PROTOCOL_ABSENCE_REQUESTS.filter((r) => r.personId === personId);
    return {
      personId,
      name: personName(personId),
      office: this.officeFor(personId),
      monthKey,
      duties,
      officialThisMonth: official,
      target: PROTOCOL_RULES.preferTarget,
      led: duties.filter((d) => d.role !== 'MEMBER').length,
      absent: records.filter((r) => r.status === 'ABSENT').length,
      excused: records.filter((r) => r.status === 'EXCUSED').length,
      absenceRequests: requests.length,
    };
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
      '/systems/protocol',
    );
    return { ok: true, id };
  },


  /* ─── Contributions (→ shared Finance fund-protocol) ─── */










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

/**
 * Music → Protocol change feed. When the published Music schedule changes for a
 * month Protocol already planned, tell leadership once (until the coordinator
 * reviews the changes or rebuilds the teams).
 */
musicScheduleService.onPublishedChange(({ periodKey, version, kind, months, logId, summary, stage, byPersonId }) => {
  // Every release and every edit lands in the Coordinator's inbox, with what changed.
  if (logId && (kind === 'PUBLISHED' || kind === 'UPDATED')) {
    const month = protocolService.monthLabel(periodKey).split(' · ')[0];
    const who = byPersonId ? ` by ${personName(byPersonId)}` : '';
    const where = stage === 'CONFIRMED' ? 'confirmed month' : 'published schedule';
    const released = kind === 'PUBLISHED' && summary === 'Released to the choirs';
    notifyPeople(
      coordinatorPersonIds(),
      released ? 'MUSIC_PUBLISHED' : 'MUSIC_EDITED',
      released
        ? `Music published ${month}`
        : `Music edited ${month} (${where}, v${version})`,
      `${summary ?? ''}${who}`.trim(),
      '/systems/protocol/music',
    );
  }
  if (kind === 'BATCH_CONFIRMED') {
    const list = months ?? [periodKey];
    const first = protocolService.monthLabel(list[0]!);
    const range =
      list.length === 1
        ? first.split(' · ')[0]
        : `${first.split(' · ')[0]} – ${protocolService.monthLabel(list[list.length - 1]!).split(' · ')[0]}`;
    notifyPeople(
      coordinatorPersonIds(),
      'MUSIC_CONFIRMED',
      `Music confirmed ${range}`,
      `${list.length} month${list.length === 1 ? ' is' : 's are'} ready for service teams. Not yet released to the choirs.`,
      '/systems/protocol/teams',
    );
    return;
  }
  const plan = protocolService.getMonthPlan(periodKey);
  if (!plan?.musicSnapshot || plan.musicStaleNotified) return;
  const sync = protocolService.musicSync(periodKey);
  if (sync.state !== 'STALE') return;
  updateProtocolMonthPlan(periodKey, { musicStaleNotified: true });
  const published = plan.status === 'PUBLISHED';
  notifyPeople(
    leadershipPersonIds(),
    'MUSIC_CHANGED',
    `Music schedule changed for ${periodKey}`,
    `${sync.changes.length} change${sync.changes.length === 1 ? '' : 's'} since the Protocol teams were built (Music v${version}).` +
      (published
        ? ' The published schedule needs attention.'
        : ' Review before submitting.'),
    '/systems/protocol/teams',
  );
});
