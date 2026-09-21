import { PROTOCOL_ROSTER } from './protocolMembersSeed';
import type {
  ProtocolActivityEvent,
  ProtocolAbsenceRequest,
  ProtocolAttendanceRecord,
  ProtocolContribution,
  ProtocolFillInOffer,
  ProtocolMonthPlan,
  ProtocolNotification,
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
};

/** Live month + next month only (demo clock: Sep 2026). */
export const PROTOCOL_ALLOWED_MONTHS = ['2026-09', '2026-10'] as const;

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

export let PROTOCOL_CONTRIBUTIONS: ProtocolContribution[] = [];

export let PROTOCOL_NOTIFICATIONS: ProtocolNotification[] = [];

export let PROTOCOL_ACTIVITY: ProtocolActivityEvent[] = [];

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
  PROTOCOL_MONTH_PLANS = PROTOCOL_MONTH_PLANS.map((p) =>
    p.monthKey === monthKey ? { ...p, ...patch } : p,
  );
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

export function pushProtocolContribution(c: ProtocolContribution) {
  PROTOCOL_CONTRIBUTIONS = [c, ...PROTOCOL_CONTRIBUTIONS];
}

export function updateProtocolContribution(
  id: string,
  patch: Partial<ProtocolContribution>,
) {
  PROTOCOL_CONTRIBUTIONS = PROTOCOL_CONTRIBUTIONS.map((c) =>
    c.id === id ? { ...c, ...patch } : c,
  );
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
