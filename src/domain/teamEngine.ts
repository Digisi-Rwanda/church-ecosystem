/**
 * Protocol service-team builder.
 *
 * Depends on a published Music schedule (services synced elsewhere).
 * Rules: no Friday; team of 10; official target 3/month; Extra (4th) only when
 * everyone already has 3 and a team is still short; no SS1+SS2 same Sunday;
 * choir members only on services where Music scheduled their choir;
 * engine recommends TL + VTL for coordinator approval.
 */
import type {
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
): boolean {
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

export function choirAllows(
  member: ProtocolRosterMember,
  service: ProtocolService,
  choirUnits: ChoirUnitsByPerson,
  unitsOnService: UnitsOnService,
  requireChoir: boolean,
): boolean {
  if (!requireChoir) return true;
  const mine = choirUnits.get(member.personId);
  if (!mine || mine.size === 0) return true;
  const musicId = service.musicServiceId ?? service.id;
  const onSvc = unitsOnService.get(musicId);
  if (!onSvc || onSvc.size === 0) return false;
  for (const u of mine) {
    if (onSvc.has(u)) return true;
  }
  return false;
}

function pickLeaders(
  team: ProtocolTeamSlot[],
  rosterByPerson: Map<string, ProtocolRosterMember>,
): ProtocolTeamSlot[] {
  if (team.length === 0) return team;
  const ranked = [...team].sort((a, b) => {
    const oa = rosterByPerson.get(a.personId)?.office ?? 'MEMBER';
    const ob = rosterByPerson.get(b.personId)?.office ?? 'MEMBER';
    const rank = (o: string) =>
      o === 'COORDINATOR'
        ? 0
        : o === 'PRESIDENT'
          ? 1
          : o === 'VP'
            ? 2
            : o === 'SECRETARY'
              ? 3
              : 4;
    const d = rank(oa) - rank(ob);
    if (d !== 0) return d;
    return a.personId.localeCompare(b.personId);
  });
  return ranked.map((slot, i) => {
    if (i === 0) {
      return {
        ...slot,
        recommendedRole: 'TEAM_LEADER' as const,
        roleStatus: 'RECOMMENDED' as const,
      };
    }
    if (i === 1) {
      return {
        ...slot,
        recommendedRole: 'VICE_LEADER' as const,
        roleStatus: 'RECOMMENDED' as const,
      };
    }
    return slot;
  });
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
      if (!canServeKind(m, service.kind)) return false;
      if (isUnavailable(m, service.date)) return false;
      if (alreadyOnThisService.has(m.personId)) return false;
      if (service.kind === 'SS2' && sameDaySs1.has(m.personId)) return false;
      if (
        !choirAllows(
          m,
          service,
          choirUnits,
          unitsOnService,
          rules.requireChoirOnService,
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

    const withLeaders = pickLeaders(teamSlots, rosterByPerson);
    for (let i = 0; i < teamSlots.length; i++) {
      const idx = slots.findIndex((s) => s.id === teamSlots[i]!.id);
      if (idx >= 0) slots[idx] = withLeaders[i]!;
    }
  }

  return { slots, warnings };
}

export function validateProtocolTeams(input: {
  services: ProtocolService[];
  roster: ProtocolRosterMember[];
  slots: ProtocolTeamSlot[];
  rules: ProtocolSchedulingRules;
  choirUnits: ChoirUnitsByPerson;
  unitsOnService: UnitsOnService;
}): string[] {
  const issues: string[] = [];
  const serviceById = new Map(input.services.map((s) => [s.id, s]));
  const rosterByPerson = new Map(input.roster.map((m) => [m.personId, m]));

  for (const service of input.services) {
    const team = input.slots.filter(
      (s) => s.serviceId === service.id && s.slotKind !== 'FILL_IN',
    );
    // Count unique people after fill-in replacements roughly by personId
    if (team.length < service.targetTeamSize) {
      issues.push(
        `${service.label}: team size ${team.length} < target ${service.targetTeamSize}`,
      );
    }
    if (team.length > service.targetTeamSize) {
      issues.push(
        `${service.label}: team size ${team.length} > target ${service.targetTeamSize}`,
      );
    }
    for (const slot of team) {
      const member = rosterByPerson.get(slot.personId);
      if (!member) {
        issues.push(`${service.label}: unknown person ${slot.personId}`);
        continue;
      }
      if (member.status !== 'ACTIVE') {
        issues.push(`${service.label}: ${slot.personId} not ACTIVE`);
      }
      if (!canServeKind(member, service.kind)) {
        issues.push(
          `${service.label}: ${slot.personId} cannot serve ${service.kind}`,
        );
      }
      if (
        !choirAllows(
          member,
          service,
          input.choirUnits,
          input.unitsOnService,
          input.rules.requireChoirOnService,
        )
      ) {
        issues.push(
          `${service.label}: ${slot.personId} choir not scheduled (Music)`,
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
        issues.push(`${svc.date}: ${slot.personId} on both SS1 and SS2`);
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
        // Extra beyond hardMax is invalid
        const totalOfficial = input.slots.filter((s) => {
          if (s.personId !== member.personId) return false;
          if (s.slotKind === 'FILL_IN') return false;
          return serviceById.get(s.serviceId)?.monthKey === monthKey;
        }).length;
        if (totalOfficial > input.rules.hardMax) {
          issues.push(
            `${monthKey}: ${member.personId} has ${totalOfficial} official duties (max ${input.rules.hardMax})`,
          );
        }
      }
    }
  }

  return issues;
}

/** Faithful Servant scoring. */
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
