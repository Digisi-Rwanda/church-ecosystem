/**
 * Protocol service-team builder.
 *
 * Depends on a published Music schedule (services synced elsewhere).
 * Rules: no Friday; team of 10; official target 3/month; Extra (4th) only when
 * everyone already has 3 and a team is still short; no SS1+SS2 same Sunday;
 * choir members only on services where Music scheduled their choir;
 * engine recommends TL + VTL for coordinator approval.
 */
import { musicUnitKind } from './musicUnits';
import type {
  ProtocolIssue,
  ProtocolIssueCode,
  ProtocolRosterMember,
  ProtocolSchedulingRules,
  ProtocolService,
  ProtocolServiceKind,
  ProtocolTeamSlot,
} from './types';

/** personId → Music unit ids whose choir they belong to (empty = no choir). */
export type ChoirUnitsByPerson = Map<string, Set<string>>;

/** musicServiceId → Music unit ids assigned that service. */
export type UnitsOnService = Map<string, Set<string>>;

export function canServeKind(
  member: ProtocolRosterMember,
  kind: ProtocolServiceKind,
  date?: string,
): boolean {
  // Picked services for that month beat the general rule.
  if (date && member.onlyServices?.length) {
    const month = date.slice(0, 7);
    const inMonth = member.onlyServices.filter((x) => x.date.slice(0, 7) === month);
    if (inMonth.length) return inMonth.some((x) => x.date === date && x.kind === kind);
  }
  if (member.allowedServiceKinds?.length) {
    return member.allowedServiceKinds.includes(kind);
  }
  if (kind === 'TUESDAY') {
    return member.serveDays === 'TUESDAY' || member.serveDays === 'BOTH';
  }
  // SS1, SS2, IGABURO count as Sunday-family for serveDays
  return member.serveDays === 'SUNDAY' || member.serveDays === 'BOTH';
}

function isUnavailable(member: ProtocolRosterMember, date: string): boolean {
  return member.unavailableDates.includes(date);
}

/** Official load only (REGULAR) — fill-ins and extras tracked separately. */
function officialLoad(
  personId: string,
  slots: ProtocolTeamSlot[],
  serviceById: Map<string, ProtocolService>,
  monthKey: string,
): number {
  return slots.filter((s) => {
    if (s.personId !== personId) return false;
    if (s.slotKind !== 'REGULAR') return false;
    return serviceById.get(s.serviceId)?.monthKey === monthKey;
  }).length;
}

/**
 * Which kind of Music scheduling blocks this member from this service, if any.
 * A member is allowed when ANY of the units they belong to (choirs, and the
 * Worship team when `requireWorship` is on) is scheduled on the service.
 */
export function musicConflictCode(
  member: ProtocolRosterMember,
  service: ProtocolService,
  choirUnits: ChoirUnitsByPerson,
  unitsOnService: UnitsOnService,
  requireChoir: boolean,
  requireWorship: boolean = requireChoir,
): 'CHOIR_NOT_SCHEDULED' | 'WORSHIP_NOT_SCHEDULED' | undefined {
  const mine = [...(choirUnits.get(member.personId) ?? [])].filter((u) =>
    musicUnitKind(u) === 'WORSHIP' ? requireWorship : requireChoir,
  );
  if (mine.length === 0) return undefined;
  const musicId = service.musicServiceId ?? service.id;
  const onSvc = unitsOnService.get(musicId);
  if (onSvc && mine.some((u) => onSvc.has(u))) return undefined;
  return mine.every((u) => musicUnitKind(u) === 'WORSHIP')
    ? 'WORSHIP_NOT_SCHEDULED'
    : 'CHOIR_NOT_SCHEDULED';
}

/**
 * Whether the choir / Worship-on-service rules apply to a service kind, after
 * any per-month relaxation by the Coordinator.
 */
export function musicRequirements(
  rules: ProtocolSchedulingRules,
  kind: ProtocolServiceKind,
): { choir: boolean; worship: boolean } {
  const relaxed = rules.relaxChoirOnKinds?.includes(kind) ?? false;
  return {
    choir: rules.requireChoirOnService && !relaxed,
    worship:
      (rules.requireWorshipOnService ?? rules.requireChoirOnService) && !relaxed,
  };
}

export function choirAllows(
  member: ProtocolRosterMember,
  service: ProtocolService,
  choirUnits: ChoirUnitsByPerson,
  unitsOnService: UnitsOnService,
  requireChoir: boolean,
  requireWorship: boolean = requireChoir,
): boolean {
  return (
    musicConflictCode(
      member,
      service,
      choirUnits,
      unitsOnService,
      requireChoir,
      requireWorship,
    ) === undefined
  );
}

const OFFICE_RANK = (o: string) =>
  o === 'COORDINATOR'
    ? 0
    : o === 'PRESIDENT'
      ? 1
      : o === 'VP'
        ? 2
        : o === 'SECRETARY'
          ? 3
          : 4;

/**
 * Best candidates for Team Leader then Vice Team Leader, in order: office
 * first, then whoever has led least so far (so leading rotates), then name.
 */
export function rankLeaderCandidates(
  personIds: string[],
  rosterByPerson: Map<string, ProtocolRosterMember>,
  leadCount: Map<string, number> = new Map(),
): string[] {
  return [...personIds].sort((a, b) => {
    const d =
      OFFICE_RANK(rosterByPerson.get(a)?.office ?? 'MEMBER') -
      OFFICE_RANK(rosterByPerson.get(b)?.office ?? 'MEMBER');
    if (d !== 0) return d;
    const l = (leadCount.get(a) ?? 0) - (leadCount.get(b) ?? 0);
    if (l !== 0) return l;
    return a.localeCompare(b);
  });
}

/** Marks a recommended TL and VTL on a team; keeps the team's order. */
function pickLeaders(
  team: ProtocolTeamSlot[],
  rosterByPerson: Map<string, ProtocolRosterMember>,
  leadCount: Map<string, number>,
): ProtocolTeamSlot[] {
  if (team.length === 0) return team;
  const [tl, vtl] = rankLeaderCandidates(
    team.map((s) => s.personId),
    rosterByPerson,
    leadCount,
  );
  if (tl) leadCount.set(tl, (leadCount.get(tl) ?? 0) + 1);
  if (vtl) leadCount.set(vtl, (leadCount.get(vtl) ?? 0) + 1);
  return team.map((slot) =>
    slot.personId === tl
      ? { ...slot, recommendedRole: 'TEAM_LEADER' as const, roleStatus: 'RECOMMENDED' as const }
      : slot.personId === vtl
        ? { ...slot, recommendedRole: 'VICE_LEADER' as const, roleStatus: 'RECOMMENDED' as const }
        : slot,
  );
}

export function buildProtocolTeams(input: {
  services: ProtocolService[];
  roster: ProtocolRosterMember[];
  rules: ProtocolSchedulingRules;
  choirUnits: ChoirUnitsByPerson;
  unitsOnService: UnitsOnService;
}): { slots: ProtocolTeamSlot[]; warnings: string[] } {
  const { services, roster, rules, choirUnits, unitsOnService } = input;
  const warnings: string[] = [];
  const slots: ProtocolTeamSlot[] = [];
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const rosterByPerson = new Map(roster.map((m) => [m.personId, m]));
  const ordered = [...services].sort((a, b) =>
    a.date === b.date
      ? a.kind.localeCompare(b.kind)
      : a.date.localeCompare(b.date),
  );

  let slotSeq = 0;
  const leadCount = new Map<string, number>();

  for (const service of ordered) {
    const sameDaySs1 = new Set(
      slots
        .filter((s) => {
          const svc = serviceById.get(s.serviceId);
          return (
            svc &&
            svc.date === service.date &&
            svc.kind === 'SS1' &&
            service.kind === 'SS2'
          );
        })
        .map((s) => s.personId),
    );

    const alreadyOnThisService = new Set(
      slots.filter((s) => s.serviceId === service.id).map((s) => s.personId),
    );

    const need = service.targetTeamSize || rules.defaultTeamSize;

    const loads = roster
      .filter((m) => m.status === 'ACTIVE')
      .map((m) => officialLoad(m.personId, slots, serviceById, service.monthKey));
    const allAtTarget =
      loads.length > 0 && loads.every((n) => n >= rules.preferTarget);

    const eligible = roster.filter((m) => {
      if (m.status !== 'ACTIVE') return false;
      if (!canServeKind(m, service.kind, service.date)) return false;
      if (isUnavailable(m, service.date)) return false;
      if (alreadyOnThisService.has(m.personId)) return false;
      if (service.kind === 'SS2' && sameDaySs1.has(m.personId)) return false;
      if (
        !choirAllows(
          m,
          service,
          choirUnits,
          unitsOnService,
          musicRequirements(rules, service.kind).choir,
          musicRequirements(rules, service.kind).worship,
        )
      ) {
        return false;
      }
      const load = officialLoad(
        m.personId,
        slots,
        serviceById,
        service.monthKey,
      );
      if (load < rules.preferTarget) return true;
      // Extra (4th) only when everyone already has 3 and team still needs people
      if (
        load < rules.hardMax &&
        allAtTarget &&
        alreadyOnThisService.size < need
      ) {
        return true;
      }
      return false;
    });

    eligible.sort((a, b) => {
      const loadA = officialLoad(
        a.personId,
        slots,
        serviceById,
        service.monthKey,
      );
      const loadB = officialLoad(
        b.personId,
        slots,
        serviceById,
        service.monthKey,
      );
      if (loadA !== loadB) return loadA - loadB;
      return a.personId.localeCompare(b.personId);
    });

    const picked = eligible.slice(0, need);
    if (picked.length < need) {
      warnings.push(
        `${service.label} (${service.date}): only ${picked.length}/${need} eligible`,
      );
    }

    const teamSlots: ProtocolTeamSlot[] = [];
    for (const m of picked) {
      const load = officialLoad(
        m.personId,
        slots,
        serviceById,
        service.monthKey,
      );
      const slotKind = load >= rules.preferTarget ? 'EXTRA' : 'REGULAR';
      slotSeq += 1;
      const row: ProtocolTeamSlot = {
        id: `pts-${service.monthKey}-${slotSeq}`,
        serviceId: service.id,
        personId: m.personId,
        source: 'ENGINE',
        role: 'MEMBER',
        slotKind,
      };
      teamSlots.push(row);
      slots.push(row);
      alreadyOnThisService.add(m.personId);
    }

    const withLeaders = pickLeaders(teamSlots, rosterByPerson, leadCount);
    for (let i = 0; i < teamSlots.length; i++) {
      const idx = slots.findIndex((s) => s.id === teamSlots[i]!.id);
      if (idx >= 0) slots[idx] = withLeaders[i]!;
    }
  }

  return { slots, warnings };
}

function issue(
  code: ProtocolIssueCode,
  severity: ProtocolIssue['severity'],
  message: string,
  ids: { serviceId?: string; personId?: string; monthKey?: string },
): ProtocolIssue {
  return {
    key: `${code}|${ids.serviceId ?? ids.monthKey ?? ''}|${ids.personId ?? ''}`,
    code,
    severity,
    message,
    serviceId: ids.serviceId,
    personId: ids.personId,
  };
}

/**
 * Structured validation. BLOCKING issues are rule violations (they stop
 * submit/publish unless a coordinator overrides them); WARNING issues are
 * quality notes (short teams, etc.).
 */
export function validateProtocolTeamsDetailed(input: {
  services: ProtocolService[];
  roster: ProtocolRosterMember[];
  slots: ProtocolTeamSlot[];
  rules: ProtocolSchedulingRules;
  choirUnits: ChoirUnitsByPerson;
  unitsOnService: UnitsOnService;
}): ProtocolIssue[] {
  const issues: ProtocolIssue[] = [];
  const serviceById = new Map(input.services.map((s) => [s.id, s]));
  const rosterByPerson = new Map(input.roster.map((m) => [m.personId, m]));

  for (const service of input.services) {
    const team = input.slots.filter(
      (s) => s.serviceId === service.id && s.slotKind !== 'FILL_IN',
    );
    if (team.length < service.targetTeamSize) {
      issues.push(
        issue(
          'TEAM_SHORT',
          'WARNING',
          `${service.label}: team size ${team.length} < target ${service.targetTeamSize}`,
          { serviceId: service.id },
        ),
      );
    }
    if (team.length > service.targetTeamSize) {
      issues.push(
        issue(
          'TEAM_OVER',
          'WARNING',
          `${service.label}: team size ${team.length} > target ${service.targetTeamSize}`,
          { serviceId: service.id },
        ),
      );
    }
    for (const slot of team) {
      const ids = { serviceId: service.id, personId: slot.personId };
      const member = rosterByPerson.get(slot.personId);
      if (!member) {
        issues.push(
          issue(
            'UNKNOWN_PERSON',
            'BLOCKING',
            `${service.label}: unknown person ${slot.personId}`,
            ids,
          ),
        );
        continue;
      }
      if (member.status !== 'ACTIVE') {
        issues.push(
          issue(
            'NOT_ACTIVE',
            'BLOCKING',
            `${service.label}: ${slot.personId} not ACTIVE`,
            ids,
          ),
        );
      }
      if (!canServeKind(member, service.kind, service.date)) {
        issues.push(
          issue(
            'CANNOT_SERVE',
            'BLOCKING',
            `${service.label}: ${slot.personId} cannot serve ${service.kind}`,
            ids,
          ),
        );
      }
      const conflict = musicConflictCode(
        member,
        service,
        input.choirUnits,
        input.unitsOnService,
        musicRequirements(input.rules, service.kind).choir,
        musicRequirements(input.rules, service.kind).worship,
      );
      if (conflict) {
        issues.push(
          issue(
            conflict,
            'BLOCKING',
            conflict === 'WORSHIP_NOT_SCHEDULED'
              ? `${service.label}: ${slot.personId} Worship team not scheduled (Music)`
              : `${service.label}: ${slot.personId} choir not scheduled (Music)`,
            ids,
          ),
        );
      }
    }
  }

  for (const svc of input.services.filter((s) => s.kind === 'SS2')) {
    const ss1 = input.services.find(
      (s) => s.date === svc.date && s.kind === 'SS1',
    );
    if (!ss1) continue;
    const a = new Set(
      input.slots
        .filter((s) => s.serviceId === ss1.id && s.slotKind !== 'FILL_IN')
        .map((s) => s.personId),
    );
    for (const slot of input.slots.filter(
      (s) => s.serviceId === svc.id && s.slotKind !== 'FILL_IN',
    )) {
      if (a.has(slot.personId)) {
        issues.push(
          issue(
            'DOUBLE_SUNDAY',
            'BLOCKING',
            `${svc.date}: ${slot.personId} on both SS1 and SS2`,
            { serviceId: svc.id, personId: slot.personId },
          ),
        );
      }
    }
  }

  const monthKeys = [...new Set(input.services.map((s) => s.monthKey))];
  for (const monthKey of monthKeys) {
    for (const member of input.roster) {
      const load = officialLoad(
        member.personId,
        input.slots,
        serviceById,
        monthKey,
      );
      if (load > input.rules.preferTarget) {
        const totalOfficial = input.slots.filter((s) => {
          if (s.personId !== member.personId) return false;
          if (s.slotKind === 'FILL_IN') return false;
          return serviceById.get(s.serviceId)?.monthKey === monthKey;
        }).length;
        if (totalOfficial > input.rules.hardMax) {
          issues.push(
            issue(
              'OVER_MAX',
              'BLOCKING',
              `${monthKey}: ${member.personId} has ${totalOfficial} official duties (max ${input.rules.hardMax})`,
              { monthKey, personId: member.personId },
            ),
          );
        }
      }
    }
  }

  return issues;
}

/** Message-only view, kept for existing callers. */
export function validateProtocolTeams(
  input: Parameters<typeof validateProtocolTeamsDetailed>[0],
): string[] {
  return validateProtocolTeamsDetailed(input).map((i) => i.message);
}

/** Member performance scoring. */
export const PROTOCOL_SCORE_POINTS = {
  PRESENT: 5,
  HALF_PRESENT: 3,
  EXCUSED: 0,
  ABSENT: -3,
  EXTRA: 7,
  FILL_IN: 10,
} as const;

export function scoreAttendanceRow(input: {
  status: 'PRESENT' | 'HALF_PRESENT' | 'EXCUSED' | 'ABSENT';
  slotKind?: 'REGULAR' | 'EXTRA' | 'FILL_IN';
}): number {
  const { status, slotKind } = input;
  if (status === 'EXCUSED') return PROTOCOL_SCORE_POINTS.EXCUSED;
  if (status === 'ABSENT') return PROTOCOL_SCORE_POINTS.ABSENT;
  if (slotKind === 'FILL_IN') return PROTOCOL_SCORE_POINTS.FILL_IN;
  if (slotKind === 'EXTRA') return PROTOCOL_SCORE_POINTS.EXTRA;
  if (status === 'HALF_PRESENT') return PROTOCOL_SCORE_POINTS.HALF_PRESENT;
  return PROTOCOL_SCORE_POINTS.PRESENT;
}
