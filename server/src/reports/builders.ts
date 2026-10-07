/**
 * Report builders (slice 3.5). Each takes plain records and returns a snapshot: a few summary
 * figures and some tables. Pure, so every figure is testable. Money and offering counts are
 * built by different builders from different records and never appear in the same report.
 */
export const KINDS = ['MEETINGS', 'ATTENDANCE', 'MONEY', 'COLLECTIONS', 'PEOPLE_LIST', 'WORK_PLANS'] as const;
export type ReportKind = (typeof KINDS)[number];

/** The module and letter a person must hold in the system to compose a report of this kind. */
export const SOURCE: Record<ReportKind, 'GOVERNANCE' | 'MONEY' | 'PEOPLE' | 'MISSION'> = {
  MEETINGS: 'GOVERNANCE',
  ATTENDANCE: 'GOVERNANCE',
  MONEY: 'MONEY',
  COLLECTIONS: 'GOVERNANCE',
  PEOPLE_LIST: 'PEOPLE',
  WORK_PLANS: 'MISSION',
};

export type CellType = 'text' | 'date' | 'money' | 'number' | 'code' | 'percent';
export type Cell = string | number | null;
export interface Snapshot {
  version: 1;
  kind: ReportKind;
  periodKey: string;
  unitName: string;
  summary: Array<{ key: string; value: Cell; type: CellType }>;
  tables: Array<{ key: string; columns: Array<{ key: string; type: CellType }>; rows: Cell[][] }>;
}

type D = Date | string;
export const periodOk = (k: string): boolean => /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(k);
/** Rwanda time is two hours ahead of UTC. */
export const inPeriod = (d: D | null | undefined, key: string): boolean => !!d && new Date(new Date(d).getTime() + 2 * 3600 * 1000).toISOString().startsWith(key);
const day = (d: D | null | undefined): string | null => (d ? new Date(new Date(d).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10) : null);
const before = (d: D, key: string): boolean => new Date(new Date(d).getTime() + 2 * 3600 * 1000).toISOString().slice(0, key.length) < key;

export interface Sources {
  unitId: string;
  systemId: string;
  names: Map<string, string>;
  meetings: Array<{ orgUnitId: string; title: string; scheduledAt: D; status: string; attendeesJson?: string | null }>;
  decisions: Array<{ orgUnitId: string; title: string; status: string; createdAt: D }>;
  accounts: Array<{ id: string; orgUnitId: string; name: string }>;
  entries: Array<{ accountId: string; orgUnitId: string; kind: string; amount: number; occurredOn: D; category: string; note?: string | null; status: string }>;
  counts: Array<{ orgUnitId: string; serviceOn: D; label: string; kind: string; amount: number; status: string; handedToId?: string | null }>;
  memberships: Array<{ personId: string; orgUnitId?: string | null; systemId?: string | null; type: string; status: string; startDate: D; endDate?: D | null }>;
  positions: Array<{ personId: string; orgUnitId?: string | null; title: string; status: string }>;
  plans: Array<{ orgUnitId: string; title: string; status: string; leaderPersonId: string; outcome?: string | null; reportPublishedAt?: D | null; deletedAt?: D | null }>;
  /** People whose records exist: used to skip anyone archived. */
  activePeople: Set<string>;
}

const attendees = (json?: string | null): string[] => {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function meetings(s: Sources, key: string): Pick<Snapshot, 'summary' | 'tables'> {
  const ms = s.meetings.filter((m) => m.orgUnitId === s.unitId && inPeriod(m.scheduledAt, key)).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const ds = s.decisions.filter((d) => d.orgUnitId === s.unitId && inPeriod(d.createdAt, key));
  return {
    summary: [
      { key: 'held', value: ms.filter((m) => m.status === 'HELD').length, type: 'number' },
      { key: 'planned', value: ms.filter((m) => m.status === 'PLANNED').length, type: 'number' },
      { key: 'cancelled', value: ms.filter((m) => m.status === 'CANCELLED').length, type: 'number' },
      { key: 'approved', value: ds.filter((d) => d.status === 'APPROVED').length, type: 'number' },
      { key: 'waiting', value: ds.filter((d) => d.status === 'DRAFT').length, type: 'number' },
    ],
    tables: [
      { key: 'meetings', columns: [{ key: 'title', type: 'text' }, { key: 'date', type: 'date' }, { key: 'status', type: 'code' }], rows: ms.map((m) => [m.title, day(m.scheduledAt), m.status]) },
      { key: 'decisions', columns: [{ key: 'title', type: 'text' }, { key: 'date', type: 'date' }, { key: 'status', type: 'code' }], rows: ds.map((d) => [d.title, day(d.createdAt), d.status]) },
    ],
  };
}

function attendance(s: Sources, key: string): Pick<Snapshot, 'summary' | 'tables'> {
  const held = s.meetings.filter((m) => m.orgUnitId === s.unitId && m.status === 'HELD' && inPeriod(m.scheduledAt, key)).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const per = new Map<string, number>();
  for (const m of held) for (const id of new Set(attendees(m.attendeesJson))) per.set(id, (per.get(id) ?? 0) + 1);
  const total = held.length;
  const rows = [...per.entries()]
    .map(([id, n]) => [s.names.get(id) ?? '—', n, total ? Math.round((n / total) * 100) : 0] as Cell[])
    .sort((a, b) => (b[1] as number) - (a[1] as number) || String(a[0]).localeCompare(String(b[0])));
  const counts = held.map((m) => new Set(attendees(m.attendeesJson)).size);
  return {
    summary: [
      { key: 'held', value: total, type: 'number' },
      { key: 'people', value: per.size, type: 'number' },
      { key: 'average', value: total ? Math.round(sum(counts) / total) : 0, type: 'number' },
    ],
    tables: [
      { key: 'perMeeting', columns: [{ key: 'title', type: 'text' }, { key: 'date', type: 'date' }, { key: 'attended', type: 'number' }], rows: held.map((m, i) => [m.title, day(m.scheduledAt), counts[i]]) },
      { key: 'perPerson', columns: [{ key: 'name', type: 'text' }, { key: 'meetings', type: 'number' }, { key: 'rate', type: 'percent' }], rows },
    ],
  };
}

function money(s: Sources, key: string): Pick<Snapshot, 'summary' | 'tables'> {
  const accs = s.accounts.filter((a) => a.orgUnitId === s.unitId);
  const rows: Cell[][] = [];
  let tIn = 0, tOut = 0, tClose = 0, tPending = 0;
  for (const a of accs) {
    const es = s.entries.filter((e) => e.accountId === a.id);
    const net = (xs: typeof es) => sum(xs.filter((e) => e.kind === 'INCOME' && e.status === 'RECORDED').map((e) => e.amount)) - sum(xs.filter((e) => e.kind === 'SPENDING' && e.status === 'APPROVED').map((e) => e.amount));
    const opening = net(es.filter((e) => before(e.occurredOn, key)));
    const inPer = es.filter((e) => inPeriod(e.occurredOn, key));
    const income = sum(inPer.filter((e) => e.kind === 'INCOME' && e.status === 'RECORDED').map((e) => e.amount));
    const spent = sum(inPer.filter((e) => e.kind === 'SPENDING' && e.status === 'APPROVED').map((e) => e.amount));
    const pending = sum(inPer.filter((e) => e.kind === 'SPENDING' && e.status === 'PENDING_APPROVAL').map((e) => e.amount));
    rows.push([a.name, opening, income, spent, opening + income - spent, pending]);
    tIn += income; tOut += spent; tClose += opening + income - spent; tPending += pending;
  }
  const entries = s.entries
    .filter((e) => e.orgUnitId === s.unitId && inPeriod(e.occurredOn, key) && (e.status === 'RECORDED' || e.status === 'APPROVED'))
    .sort((a, b) => +new Date(a.occurredOn) - +new Date(b.occurredOn));
  return {
    summary: [
      { key: 'income', value: tIn, type: 'money' },
      { key: 'spent', value: tOut, type: 'money' },
      { key: 'closing', value: tClose, type: 'money' },
      { key: 'pending', value: tPending, type: 'money' },
    ],
    tables: [
      { key: 'accounts', columns: [{ key: 'account', type: 'text' }, { key: 'opening', type: 'money' }, { key: 'income', type: 'money' }, { key: 'spent', type: 'money' }, { key: 'closing', type: 'money' }, { key: 'pending', type: 'money' }], rows },
      {
        key: 'entries',
        columns: [{ key: 'date', type: 'date' }, { key: 'kind', type: 'code' }, { key: 'category', type: 'code' }, { key: 'amount', type: 'money' }, { key: 'note', type: 'text' }],
        rows: entries.map((e) => [day(e.occurredOn), e.kind, e.category, e.amount, e.note ?? '']),
      },
    ],
  };
}

function collections(s: Sources, key: string): Pick<Snapshot, 'summary' | 'tables'> {
  const cs = s.counts.filter((c) => c.orgUnitId === s.unitId && inPeriod(c.serviceOn, key) && c.status !== 'VOIDED').sort((a, b) => +new Date(a.serviceOn) - +new Date(b.serviceOn));
  const done = cs.filter((c) => c.status === 'CONFIRMED');
  return {
    summary: [
      { key: 'confirmed', value: sum(done.map((c) => c.amount)), type: 'money' },
      { key: 'services', value: done.length, type: 'number' },
      { key: 'unconfirmed', value: cs.length - done.length, type: 'number' },
      { key: 'notHanded', value: done.filter((c) => !c.handedToId).length, type: 'number' },
    ],
    tables: [
      {
        key: 'counts',
        columns: [{ key: 'date', type: 'date' }, { key: 'occasion', type: 'text' }, { key: 'kind', type: 'code' }, { key: 'amount', type: 'money' }, { key: 'status', type: 'code' }],
        rows: cs.map((c) => [day(c.serviceOn), c.label, c.kind, c.amount, c.status]),
      },
    ],
  };
}

function peopleList(s: Sources, key: string): Pick<Snapshot, 'summary' | 'tables'> {
  // Members of the unit (or, for a unit with no members of its own, of its system) who are live at the end of the period.
  const endOfPeriod = key.length === 4 ? `${key}-12-31` : `${key}-31`;
  const live = (m: Sources['memberships'][number]) => m.status === 'ACTIVE' && (!m.endDate || new Date(m.endDate).getTime() > Date.now() || day(m.endDate)! >= endOfPeriod.slice(0, 10));
  const mine = s.memberships.filter((m) => live(m) && s.activePeople.has(m.personId) && m.orgUnitId === s.unitId);
  const seen = new Set<string>();
  const rows: Cell[][] = [];
  for (const m of mine.sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))) {
    if (seen.has(m.personId)) continue;
    seen.add(m.personId);
    const roles = s.positions.filter((p) => p.personId === m.personId && p.orgUnitId === s.unitId && p.status === 'ACTIVE').map((p) => p.title).join(', ');
    rows.push([s.names.get(m.personId) ?? '—', roles, day(m.startDate)]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return {
    summary: [
      { key: 'members', value: rows.length, type: 'number' },
      { key: 'withRole', value: rows.filter((r) => r[1]).length, type: 'number' },
    ],
    tables: [{ key: 'members', columns: [{ key: 'name', type: 'text' }, { key: 'role', type: 'text' }, { key: 'since', type: 'date' }], rows }],
  };
}

function workPlans(s: Sources, key: string): Pick<Snapshot, 'summary' | 'tables'> {
  const ended = s.plans.filter((p) => !p.deletedAt && p.orgUnitId === s.unitId && p.status === 'ENDED' && inPeriod(p.reportPublishedAt, key)).sort((a, b) => +new Date(a.reportPublishedAt!) - +new Date(b.reportPublishedAt!));
  const open = s.plans.filter((p) => !p.deletedAt && p.orgUnitId === s.unitId && ['SETUP', 'RUNNING', 'CLOSING'].includes(p.status));
  return {
    summary: [
      { key: 'ended', value: ended.length, type: 'number' },
      { key: 'running', value: open.length, type: 'number' },
    ],
    tables: [
      { key: 'ended', columns: [{ key: 'title', type: 'text' }, { key: 'date', type: 'date' }, { key: 'leader', type: 'text' }, { key: 'outcome', type: 'text' }], rows: ended.map((p) => [p.title, day(p.reportPublishedAt), s.names.get(p.leaderPersonId) ?? '—', p.outcome ?? '']) },
    ],
  };
}

export function buildSnapshot(kind: ReportKind, periodKey: string, unitName: string, s: Sources): Snapshot {
  const make = { MEETINGS: meetings, ATTENDANCE: attendance, MONEY: money, COLLECTIONS: collections, PEOPLE_LIST: peopleList, WORK_PLANS: workPlans }[kind];
  return { version: 1, kind, periodKey, unitName, ...make(s, periodKey) };
}

/** Monthly schedules: the report for last month is due on `dueDay` of this month. */
export function scheduleStatus(
  dueDay: number,
  received: boolean,
  now: Date,
): { periodKey: string; dueOn: string; state: 'RECEIVED' | 'DUE' | 'LATE' } {
  const k = new Date(now.getTime() + 2 * 3600 * 1000);
  const y = k.getUTCFullYear(), m = k.getUTCMonth();
  const prev = new Date(Date.UTC(y, m - 1, 1));
  const periodKey = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
  const dueOn = `${y}-${String(m + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
  if (received) return { periodKey, dueOn, state: 'RECEIVED' };
  return { periodKey, dueOn, state: k.toISOString().slice(0, 10) > dueOn ? 'LATE' : 'DUE' };
}
