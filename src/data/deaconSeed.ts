import type {
  DeaconCareCase,
  DeaconContribution,
  DeaconExpenseRecord,
  DeaconRosterMember,
  DeaconVisit,
} from '../domain/types';

export const DEACON_ROSTER: DeaconRosterMember[] = [
  {
    id: 'drm-coord',
    personId: 'p-deacon-coord',
    office: 'COORDINATOR',
    status: 'ACTIVE',
  },
  {
    id: 'drm-treas',
    personId: 'p-deacon-treas',
    office: 'TREASURER',
    status: 'ACTIVE',
  },
  {
    id: 'drm-patrick',
    personId: 'p-member',
    office: 'MEMBER',
    status: 'ACTIVE',
  },
  {
    id: 'drm-secretary',
    personId: 'p-secretary',
    office: 'SECRETARY',
    status: 'INACTIVE',
  },
];

export let DEACON_CASES: DeaconCareCase[] = [];

export let DEACON_VISITS: DeaconVisit[] = [];

export let DEACON_CONTRIBUTIONS: DeaconContribution[] = [];

export let DEACON_EXPENSES: DeaconExpenseRecord[] = [];

export function pushDeaconCase(c: DeaconCareCase) {
  DEACON_CASES = [c, ...DEACON_CASES];
}

export function updateDeaconCase(
  id: string,
  patch: Partial<DeaconCareCase>,
) {
  DEACON_CASES = DEACON_CASES.map((c) =>
    c.id === id ? { ...c, ...patch } : c,
  );
}

export function pushDeaconVisit(v: DeaconVisit) {
  DEACON_VISITS = [v, ...DEACON_VISITS];
}

export function pushDeaconContribution(c: DeaconContribution) {
  DEACON_CONTRIBUTIONS = [c, ...DEACON_CONTRIBUTIONS];
}

export function updateDeaconContribution(
  id: string,
  patch: Partial<DeaconContribution>,
) {
  DEACON_CONTRIBUTIONS = DEACON_CONTRIBUTIONS.map((c) =>
    c.id === id ? { ...c, ...patch } : c,
  );
}

export function pushDeaconExpense(e: DeaconExpenseRecord) {
  DEACON_EXPENSES = [e, ...DEACON_EXPENSES];
}

export function updateDeaconExpense(
  id: string,
  patch: Partial<DeaconExpenseRecord>,
) {
  DEACON_EXPENSES = DEACON_EXPENSES.map((e) =>
    e.id === id ? { ...e, ...patch } : e,
  );
}
