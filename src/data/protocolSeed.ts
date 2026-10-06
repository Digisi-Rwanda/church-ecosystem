import { PROTOCOL_ROSTER } from './protocolMembersSeed';
import type {
  ProtocolActivityEvent,
  ProtocolAbsenceRequest,
  ProtocolAttendanceRecord,
  ProtocolFillInOffer,
  ProtocolMonthPlan,
  ProtocolNotification,
  ProtocolRosterMember,
  ProtocolScheduleVersion,
  ProtocolSchedulingRules,
  ProtocolService,
  ProtocolServiceReport,
  ProtocolSwapProposal,
  ProtocolTeamSlot,
} from '../domain/types';

export { PROTOCOL_ROSTER };

export const PROTOCOL_RULES: ProtocolSchedulingRules = {
  preferTarget: 3,
  softMax: 3,
  hardMax: 4,
  defaultTeamSize: 10,
  requireChoirOnService: true,
  requireWorshipOnService: true,
};

/**
 * Services are synced from published Music schedule (no Friday).
 * Start empty until Protocol syncs a month.
 */
export let PROTOCOL_SERVICES: ProtocolService[] = [];

export let PROTOCOL_MONTH_PLANS: ProtocolMonthPlan[] = [];

export let PROTOCOL_TEAM_SLOTS: ProtocolTeamSlot[] = [];

export let PROTOCOL_HISTORY: ProtocolScheduleVersion[] = [];

export let PROTOCOL_ATTENDANCE: ProtocolAttendanceRecord[] = [];
export let PROTOCOL_ABSENCE_REQUESTS: ProtocolAbsenceRequest[] = [];
export let PROTOCOL_FILL_IN_OFFERS: ProtocolFillInOffer[] = [];
export let PROTOCOL_SWAP_PROPOSALS: ProtocolSwapProposal[] = [];
export let PROTOCOL_SERVICE_REPORTS: ProtocolServiceReport[] = [];


export let PROTOCOL_NOTIFICATIONS: ProtocolNotification[] = [];

export let PROTOCOL_ACTIVITY: ProtocolActivityEvent[] = [];

/** Add or replace a roster row in place (the roster array is shared). */
export function upsertProtocolRosterMember(row: ProtocolRosterMember) {
  const i = PROTOCOL_ROSTER.findIndex((m) => m.id === row.id);
  if (i >= 0) PROTOCOL_ROSTER[i] = row;
  else PROTOCOL_ROSTER.push(row);
}

export function replaceProtocolServices(services: ProtocolService[]) {
  PROTOCOL_SERVICES = services;
}

export function replaceProtocolTeamSlots(slots: ProtocolTeamSlot[]) {
  PROTOCOL_TEAM_SLOTS = slots;
}

export function updateProtocolMonthPlan(
  monthKey: string,
  patch: Partial<ProtocolMonthPlan>,
) {
  const existing = PROTOCOL_MONTH_PLANS.find((p) => p.monthKey === monthKey);
  if (existing) {
    PROTOCOL_MONTH_PLANS = PROTOCOL_MONTH_PLANS.map((p) =>
      p.monthKey === monthKey ? { ...p, ...patch } : p,
    );
    return;
  }
  PROTOCOL_MONTH_PLANS = [
    ...PROTOCOL_MONTH_PLANS,
    {
      monthKey,
      status: 'OPEN',
      version: 0,
      validationNotes: [],
      ...patch,
    },
  ];
}

export function pushProtocolHistory(version: ProtocolScheduleVersion) {
  PROTOCOL_HISTORY = [version, ...PROTOCOL_HISTORY];
}

export function upsertProtocolAttendance(record: ProtocolAttendanceRecord) {
  const idx = PROTOCOL_ATTENDANCE.findIndex(
    (r) => r.serviceId === record.serviceId && r.personId === record.personId,
  );
  if (idx >= 0) {
    PROTOCOL_ATTENDANCE = PROTOCOL_ATTENDANCE.map((r, i) =>
      i === idx ? record : r,
    );
  } else {
    PROTOCOL_ATTENDANCE = [...PROTOCOL_ATTENDANCE, record];
  }
}

export function pushProtocolAbsence(r: ProtocolAbsenceRequest) {
  PROTOCOL_ABSENCE_REQUESTS = [r, ...PROTOCOL_ABSENCE_REQUESTS];
}

export function updateProtocolAbsence(
  id: string,
  patch: Partial<ProtocolAbsenceRequest>,
) {
  PROTOCOL_ABSENCE_REQUESTS = PROTOCOL_ABSENCE_REQUESTS.map((r) =>
    r.id === id ? { ...r, ...patch } : r,
  );
}

export function pushProtocolFillIn(o: ProtocolFillInOffer) {
  PROTOCOL_FILL_IN_OFFERS = [o, ...PROTOCOL_FILL_IN_OFFERS];
}

export function updateProtocolFillIn(
  id: string,
  patch: Partial<ProtocolFillInOffer>,
) {
  PROTOCOL_FILL_IN_OFFERS = PROTOCOL_FILL_IN_OFFERS.map((o) =>
    o.id === id ? { ...o, ...patch } : o,
  );
}

export function pushProtocolSwap(s: ProtocolSwapProposal) {
  PROTOCOL_SWAP_PROPOSALS = [s, ...PROTOCOL_SWAP_PROPOSALS];
}

export function updateProtocolSwap(
  id: string,
  patch: Partial<ProtocolSwapProposal>,
) {
  PROTOCOL_SWAP_PROPOSALS = PROTOCOL_SWAP_PROPOSALS.map((s) =>
    s.id === id ? { ...s, ...patch } : s,
  );
}

export function upsertProtocolServiceReport(r: ProtocolServiceReport) {
  const idx = PROTOCOL_SERVICE_REPORTS.findIndex(
    (x) => x.serviceId === r.serviceId,
  );
  if (idx >= 0) {
    PROTOCOL_SERVICE_REPORTS = PROTOCOL_SERVICE_REPORTS.map((x, i) =>
      i === idx ? r : x,
    );
  } else {
    PROTOCOL_SERVICE_REPORTS = [r, ...PROTOCOL_SERVICE_REPORTS];
  }
}

export function pushProtocolNotification(n: ProtocolNotification) {
  PROTOCOL_NOTIFICATIONS = [n, ...PROTOCOL_NOTIFICATIONS].slice(0, 120);
}

export function markProtocolNotificationRead(id: string) {
  PROTOCOL_NOTIFICATIONS = PROTOCOL_NOTIFICATIONS.map((n) =>
    n.id === id ? { ...n, read: true } : n,
  );
}

export function markAllProtocolNotificationsRead(personId: string) {
  PROTOCOL_NOTIFICATIONS = PROTOCOL_NOTIFICATIONS.map((n) =>
    n.personId === personId ? { ...n, read: true } : n,
  );
}

export function pushProtocolActivity(e: ProtocolActivityEvent) {
  PROTOCOL_ACTIVITY = [e, ...PROTOCOL_ACTIVITY].slice(0, 80);
}

/**
 * Re-key every record that points at a Protocol service.
 * `map.get(oldId)` = new id, or `null` to drop the work that hung off a service
 * that no longer exists (team slots, absence requests, fill-ins, swaps).
 * Attendance and service reports are history and are re-keyed but never dropped.
 */
export function remapProtocolServiceIds(map: Map<string, string | null>) {
  if (map.size === 0) return;
  const rekey = <T extends { serviceId: string }>(
    rows: T[],
    drop: boolean,
  ): T[] => {
    const out: T[] = [];
    for (const r of rows) {
      if (!map.has(r.serviceId)) {
        out.push(r);
        continue;
      }
      const next = map.get(r.serviceId);
      if (next == null) {
        if (!drop) out.push(r);
        continue;
      }
      out.push({ ...r, serviceId: next });
    }
    return out;
  };
  PROTOCOL_TEAM_SLOTS = rekey(PROTOCOL_TEAM_SLOTS, true);
  PROTOCOL_ABSENCE_REQUESTS = rekey(PROTOCOL_ABSENCE_REQUESTS, true);
  PROTOCOL_FILL_IN_OFFERS = rekey(PROTOCOL_FILL_IN_OFFERS, true);
  PROTOCOL_SWAP_PROPOSALS = rekey(PROTOCOL_SWAP_PROPOSALS, true);
  PROTOCOL_ATTENDANCE = rekey(PROTOCOL_ATTENDANCE, false);
  PROTOCOL_SERVICE_REPORTS = rekey(PROTOCOL_SERVICE_REPORTS, false);
  PROTOCOL_HISTORY = PROTOCOL_HISTORY.map((v) => ({
    ...v,
    slots: rekey(v.slots, false),
  }));
}
