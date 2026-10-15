/**
 * Report builders (slice 3.5). Each takes plain records and returns a snapshot: a few summary
 * figures and some tables. Pure, so every figure is testable. Money and offering counts are
 * built by different builders from different records and never appear in the same report.
 */
export const KINDS = ['MEETINGS', 'ATTENDANCE', 'MONEY', 'COLLECTIONS', 'PEOPLE_LIST', 'WORK_PLANS', 'BAPTISMS', 'MARRIAGES', 'YEARLY_BUDGET', 'ACTION_PLAN'] as const;
export type ReportKind = (typeof KINDS)[number];

/** The module and letter a person must hold in the system to compose a report of this kind. */
export const SOURCE: Record<ReportKind, 'GOVERNANCE' | 'MONEY' | 'PEOPLE' | 'MISSION' | 'PERSON_360'> = {
  MEETINGS: 'GOVERNANCE',
  ATTENDANCE: 'GOVERNANCE',
  MONEY: 'MONEY',
  COLLECTIONS: 'MONEY',
  PEOPLE_LIST: 'PEOPLE',
  WORK_PLANS: 'MISSION',
  BAPTISMS: 'PERSON_360',
  MARRIAGES: 'PERSON_360',
  YEARLY_BUDGET: 'MONEY',
  ACTION_PLAN: 'MISSION',
};

/**
 * The parts of each report a composer can choose between. 'summary' is the block of key figures; the rest are its tables.
 * Choosing fewer parts gives a shorter report; the records behind the left-out parts are not copied into it.
 */
export const SECTIONS: Record<ReportKind, readonly string[]> = {
  MEETINGS: ['summary', 'meetings', 'decisions'],
  ATTENDANCE: ['summary', 'perMeeting', 'perPerson'],
  MONEY: ['summary', 'accounts', 'budget', 'entries', 'amendments'],
  COLLECTIONS: ['summary', 'counts'],
  PEOPLE_LIST: ['summary', 'members'],
  WORK_PLANS: ['summary', 'ended'],
  BAPTISMS: ['summary', 'baptisms'],
  MARRIAGES: ['summary', 'marriages'],
  YEARLY_BUDGET: ['summary', 'activities', 'byType', 'months', 'amendments'],
  ACTION_PLAN: ['summary', 'activities', 'byMonth'],
};

/** Reports that describe a whole year and are composed on demand, never on the monthly schedule. */
export const YEARLY_KINDS: ReportKind[] = ['YEARLY_BUDGET', 'ACTION_PLAN'];

/** Church-wide reports made from Person 360: composed only in the main church's own system. */
/** Reports that are composed in Central Administration only (their records are kept there). */
export const CENTRAL_ONLY_KINDS: ReportKind[] = ['COLLECTIONS'];

export const CHURCH_WIDE: ReportKind[] = ['BAPTISMS', 'MARRIAGES'];

export type CellType = 'text' | 'date' | 'money' | 'number' | 'code' | 'percent';
export type Cell = string | number | null;
export interface Snapshot {
  version: 1;
  kind: ReportKind;
  periodKey: string;
  unitName: string;
  summary: Array<{ key: string; value: Cell; type: CellType }>;
  tables: Array<{ key: string; columns: Array<{ key: string; type: CellType }>; rows: Cell[][] }>;
  /** The parts the composer chose; absent means all of them. */
  sections?: string[];
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
  entries: Array<{ accountId: string; orgUnitId: string; systemId?: string | null; kind: string; amount: number; occurredOn: D; category: string; note?: string | null; status: string }>;
  budgetLines: Array<{ systemId: string; year: number; kind: string; category: string; planned: number }>;
  counts: Array<{ orgUnitId: string; serviceOn: D; label: string; kind: string; amount: number; status: string; handedToId?: string | null }>;
  memberships: Array<{ personId: string; orgUnitId?: string | null; systemId?: string | null; type: string; status: string; startDate: D; endDate?: D | null }>;
  positions: Array<{ personId: string; orgUnitId?: string | null; title: string; status: string }>;
  amendments?: Array<{ planId: string; systemId: string; kind: string; scope?: string | null; status: string; oldTotal: number; newTotal: number; justification: string; requestedById: string; decidedAt?: D | null }>;
  /** Live activities of the unit with their money: what the Yearly Budget and the Action Plan are made from. */
  activities?: Array<{ id: string; orgUnitId: string; title: string; planType: string; status: string; startsOn: D | null; leaderPersonId: string; planned: number; spent: number }>;
  /** The system's money now, as the Money home shows it. */
  funds?: { secured: number; spent: number; reserved: number; available: number };
  plans: Array<{ id?: string; orgUnitId: string; title: string; status: string; leaderPersonId: string; outcome?: string | null; reportPublishedAt?: D | null; deletedAt?: D | null }>;
  personRecords: Array<{ personId: string; section: string; dataJson: string; status: string; programId?: string | null }>;
  programs: Array<{ id: string; name: string }>;
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
  // Budget against actual: the system's budget for the year of the period, with this period and the year so far.
  const year = Number(key.slice(0, 4));
  const lines = (s.budgetLines ?? []).filter((l) => l.systemId === s.systemId && l.year === year);
  const mine = (s.entries ?? []).filter((e) => e.systemId === s.systemId);
  const actualOf = (kind: string, category: string, inRange: (d: D) => boolean) =>
    sum(mine.filter((e) => e.kind === kind && e.category === category && inRange(e.occurredOn) && e.status === (kind === 'INCOME' ? 'RECORDED' : 'APPROVED')).map((e) => e.amount));
  const throughPeriod = (d: D) => String(day(d)).slice(0, 4) === String(year) && !before(d, `${year}-01`) && (key.length === 4 || day(d)!.slice(0, 7) <= key);
  const budgetRows: Cell[][] = lines
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.category.localeCompare(b.category))
    .map((l) => {
      const inPer = actualOf(l.kind, l.category, (d) => inPeriod(d, key));
      const ytd = actualOf(l.kind, l.category, throughPeriod);
      return [l.kind, l.category, inPer, ytd, l.planned, ytd - l.planned] as Cell[];
    });
  // Every approved amendment of the period, so the Church Leader sees each change to a plan's money, schedule, mission or team.
  const titles = new Map(s.plans.filter((p) => p.id).map((p) => [p.id!, p.title]));
  const amended = (s.amendments ?? [])
    .filter((a) => a.systemId === s.systemId && a.status === 'APPROVED' && inPeriod(a.decidedAt, key))
    .sort((a, b) => +new Date(a.decidedAt!) - +new Date(b.decidedAt!));
  const amendRows: Cell[][] = amended.map((a) => [day(a.decidedAt), titles.get(a.planId) ?? '', a.scope ?? 'MONEY', a.kind, a.oldTotal, a.newTotal, s.names.get(a.requestedById) ?? '', a.justification]);
  const amendTable: Snapshot['tables'][number] = {
    key: 'amendments',
    columns: [{ key: 'date', type: 'date' }, { key: 'activity', type: 'text' }, { key: 'scope', type: 'code' }, { key: 'kind', type: 'code' }, { key: 'was', type: 'money' }, { key: 'now', type: 'money' }, { key: 'askedBy', type: 'text' }, { key: 'note', type: 'text' }],
    rows: amendRows,
  };
  return {
    summary: [
      { key: 'income', value: tIn, type: 'money' },
      { key: 'spent', value: tOut, type: 'money' },
      { key: 'closing', value: tClose, type: 'money' },
      { key: 'pending', value: tPending, type: 'money' },
    ],
    tables: [
      { key: 'accounts', columns: [{ key: 'account', type: 'text' }, { key: 'opening', type: 'money' }, { key: 'income', type: 'money' }, { key: 'spent', type: 'money' }, { key: 'closing', type: 'money' }, { key: 'pending', type: 'money' }], rows },
      ...(budgetRows.length > 0
        ? [{ key: 'budget', columns: [{ key: 'kind', type: 'code' as const }, { key: 'category', type: 'code' as const }, { key: 'period', type: 'money' as const }, { key: 'yearToDate', type: 'money' as const }, { key: 'planned', type: 'money' as const }, { key: 'difference', type: 'money' as const }], rows: budgetRows }]
        : []),
      {
        key: 'entries',
        columns: [{ key: 'date', type: 'date' }, { key: 'kind', type: 'code' }, { key: 'category', type: 'code' }, { key: 'amount', type: 'money' }, { key: 'note', type: 'text' }],
        rows: entries.map((e) => [day(e.occurredOn), e.kind, e.category, e.amount, e.note ?? '']),
      },
      ...(amendRows.length > 0 ? [amendTable] : []),
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
  const open = s.plans.filter((p) => !p.deletedAt && p.orgUnitId === s.unitId && ['SETUP', 'RUNNING', 'PAUSED', 'CLOSING'].includes(p.status));
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

const LIVE = ['SETUP', 'RUNNING', 'PAUSED', 'CLOSING'];
const TYPES = ['PROGRAM', 'PROJECT', 'EVENT'];

/** The activities of the unit that fall in the period: those that start in it, and programs that were already running. */
function activitiesIn(s: Sources, key: string) {
  return (s.activities ?? [])
    .filter((a) => a.orgUnitId === s.unitId && a.status !== 'CANCELLED')
    .filter((a) => inPeriod(a.startsOn, key) || (a.planType === 'PROGRAM' && LIVE.includes(a.status) && !!a.startsOn && day(a.startsOn)!.slice(0, 4) <= key.slice(0, 4)))
    .sort((a, b) => +new Date(a.startsOn ?? 0) - +new Date(b.startsOn ?? 0) || a.title.localeCompare(b.title));
}

/** Yearly Budget: derived from the live plans. The forecast (the income budget lines) is the only figure typed by hand. */
function yearlyBudget(s: Sources, key: string): Pick<Snapshot, 'summary' | 'tables'> {
  const year = Number(key.slice(0, 4));
  const acts = activitiesIn(s, key);
  const planned = sum(acts.map((a) => a.planned));
  const spent = sum(acts.map((a) => a.spent));
  const forecast = sum(s.budgetLines.filter((l) => l.systemId === s.systemId && l.year === year && l.kind === 'INCOME').map((l) => l.planned));
  const titles = new Map(acts.map((a) => [a.id, a.title]));
  const amended = (s.amendments ?? []).filter((a) => a.systemId === s.systemId && a.status === 'APPROVED' && titles.has(a.planId) && inPeriod(a.decidedAt, key)).sort((a, b) => +new Date(a.decidedAt!) - +new Date(b.decidedAt!));
  const months: Cell[][] = key.length === 4
    ? Array.from({ length: 12 }, (_, i) => {
        const m = `${key}-${String(i + 1).padStart(2, '0')}`;
        return [m, sum(acts.filter((a) => inPeriod(a.startsOn, m)).map((a) => a.planned)), sum((s.entries as Array<Sources['entries'][number] & { planId?: string | null }>).filter((e) => e.planId && titles.has(e.planId) && e.kind === 'SPENDING' && e.status === 'APPROVED' && inPeriod(e.occurredOn, m)).map((e) => e.amount))] as Cell[];
      })
    : [];
  return {
    summary: [
      { key: 'forecast', value: forecast, type: 'money' },
      { key: 'planned', value: planned, type: 'money' },
      { key: 'spent', value: spent, type: 'money' },
      { key: 'availableNow', value: s.funds?.available ?? 0, type: 'money' },
      { key: 'unreservedForecast', value: forecast - planned, type: 'money' },
      { key: 'amended', value: amended.length, type: 'number' },
    ],
    tables: [
      { key: 'activities', columns: [{ key: 'title', type: 'text' }, { key: 'type', type: 'code' }, { key: 'status', type: 'code' }, { key: 'planned', type: 'money' }, { key: 'spent', type: 'money' }, { key: 'left', type: 'money' }], rows: acts.map((a) => [a.title, a.planType, a.status, a.planned, a.spent, Math.max(0, a.planned - a.spent)]) },
      { key: 'byType', columns: [{ key: 'type', type: 'code' }, { key: 'count', type: 'number' }, { key: 'planned', type: 'money' }, { key: 'spent', type: 'money' }], rows: TYPES.map((t) => [t, acts.filter((a) => a.planType === t).length, sum(acts.filter((a) => a.planType === t).map((a) => a.planned)), sum(acts.filter((a) => a.planType === t).map((a) => a.spent))] as Cell[]).filter((r) => (r[1] as number) > 0) },
      ...(months.length > 0 ? [{ key: 'months', columns: [{ key: 'month', type: 'text' as const }, { key: 'planned', type: 'money' as const }, { key: 'spent', type: 'money' as const }], rows: months }] : []),
      ...(amended.length > 0 ? [{ key: 'amendments', columns: [{ key: 'date', type: 'date' as const }, { key: 'activity', type: 'text' as const }, { key: 'scope', type: 'code' as const }, { key: 'kind', type: 'code' as const }, { key: 'was', type: 'money' as const }, { key: 'now', type: 'money' as const }], rows: amended.map((a) => [day(a.decidedAt), titles.get(a.planId) ?? '', a.scope ?? 'MONEY', a.kind, a.oldTotal, a.newTotal] as Cell[]) }] : []),
    ],
  };
}

/** Action Plan: what the unit plans to do in the period, from its live activities. */
function actionPlan(s: Sources, key: string): Pick<Snapshot, 'summary' | 'tables'> {
  const acts = activitiesIn(s, key);
  return {
    summary: [
      { key: 'activities', value: acts.length, type: 'number' },
      { key: 'running', value: acts.filter((a) => LIVE.includes(a.status)).length, type: 'number' },
      { key: 'ended', value: acts.filter((a) => a.status === 'ENDED').length, type: 'number' },
      { key: 'planned', value: sum(acts.map((a) => a.planned)), type: 'money' },
    ],
    tables: [
      { key: 'activities', columns: [{ key: 'title', type: 'text' }, { key: 'type', type: 'code' }, { key: 'start', type: 'date' }, { key: 'leader', type: 'text' }, { key: 'status', type: 'code' }, { key: 'planned', type: 'money' }], rows: acts.map((a) => [a.title, a.planType, day(a.startsOn), s.names.get(a.leaderPersonId) ?? '—', a.status, a.planned]) },
      ...(key.length === 4 ? [{ key: 'byMonth', columns: [{ key: 'month', type: 'text' as const }, { key: 'count', type: 'number' as const }], rows: Array.from({ length: 12 }, (_, i) => { const m = `${key}-${String(i + 1).padStart(2, '0')}`; return [m, acts.filter((a) => inPeriod(a.startsOn, m)).length] as Cell[]; }) }] : []),
    ],
  };
}

const data = (r: { dataJson: string }): Record<string, unknown> => {
  try {
    return JSON.parse(r.dataJson);
  } catch {
    return {};
  }
};

function baptisms(s: Sources, key: string): Pick<Snapshot, 'summary' | 'tables'> {
  const rows = s.personRecords
    .filter((r) => r.section === 'BAPTISM' && r.status === 'CURRENT')
    .map((r) => ({ r, d: data(r) }))
    .filter(({ d }) => typeof d.date === 'string' && String(d.date).startsWith(key))
    .sort((a, b) => String(a.d.date).localeCompare(String(b.d.date)) || (s.names.get(a.r.personId) ?? '').localeCompare(s.names.get(b.r.personId) ?? ''));
  const cohorts = new Set(rows.map(({ r }) => r.programId).filter(Boolean));
  return {
    summary: [
      { key: 'baptised', value: rows.length, type: 'number' },
      { key: 'cohorts', value: cohorts.size, type: 'number' },
    ],
    tables: [
      {
        key: 'baptisms',
        columns: [{ key: 'name', type: 'text' }, { key: 'date', type: 'date' }, { key: 'place', type: 'text' }, { key: 'baptisedBy', type: 'text' }, { key: 'cohort', type: 'text' }],
        rows: rows.map(({ r, d }) => [s.names.get(r.personId) ?? '—', String(d.date), String(d.place ?? ''), String(d.baptisedBy ?? ''), s.programs.find((p) => p.id === r.programId)?.name ?? '']),
      },
    ],
  };
}

function marriages(s: Sources, key: string): Pick<Snapshot, 'summary' | 'tables'> {
  const rows = s.personRecords
    .filter((r) => r.section === 'MARRIAGE' && r.status === 'CURRENT')
    .map((r) => ({ r, d: data(r) }))
    .filter(({ d }) => typeof d.date === 'string' && String(d.date).startsWith(key))
    .sort((a, b) => String(a.d.date).localeCompare(String(b.d.date)));
  return {
    summary: [{ key: 'married', value: rows.length, type: 'number' }],
    tables: [
      {
        key: 'marriages',
        columns: [{ key: 'name', type: 'text' }, { key: 'spouse', type: 'text' }, { key: 'date', type: 'date' }, { key: 'place', type: 'text' }, { key: 'blessedBy', type: 'text' }],
        rows: rows.map(({ r, d }) => [s.names.get(r.personId) ?? '—', (d.spousePersonId ? s.names.get(String(d.spousePersonId)) : '') || String(d.spouseName ?? ''), String(d.date), String(d.place ?? ''), String(d.blessedBy ?? '')]),
      },
    ],
  };
}

/** Keep only the chosen parts, in the report's own order. A choice that names nothing valid keeps everything. */
export function chooseSections(snap: Snapshot, chosen: readonly string[] | undefined): Snapshot {
  const valid = (chosen ?? []).filter((k) => SECTIONS[snap.kind].includes(k));
  if (valid.length === 0 || valid.length === SECTIONS[snap.kind].length) return snap;
  return { ...snap, summary: valid.includes('summary') ? snap.summary : [], tables: snap.tables.filter((t) => valid.includes(t.key)), sections: valid };
}

export function buildSnapshot(kind: ReportKind, periodKey: string, unitName: string, s: Sources, chosen?: readonly string[]): Snapshot {
  const make = { MEETINGS: meetings, ATTENDANCE: attendance, MONEY: money, COLLECTIONS: collections, PEOPLE_LIST: peopleList, WORK_PLANS: workPlans, BAPTISMS: baptisms, MARRIAGES: marriages, YEARLY_BUDGET: yearlyBudget, ACTION_PLAN: actionPlan }[kind];
  return chooseSections({ version: 1, kind, periodKey, unitName, ...make(s, periodKey) }, chosen);
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
