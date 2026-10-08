/**
 * What can be imported, and how each line is checked and saved. Every target saves through the same call the
 * screen uses for a typed entry, so the server's own rules (who may write, limits, audit) apply to every line.
 * A line that matches something already there is skipped, never overwritten.
 */
import {
  addChoirMember, addGroupMember, addMoneyPlanItem, addProtocolMember, addSlot, addSong, createPlan, createWork, fetchBudget, fetchChoir, fetchChoirs, fetchDonations,
  fetchGroup, fetchGroups, fetchMonth, fetchMoneyAccounts, fetchMoneyEntries, fetchMoneyOptions, fetchMoneyPlan, fetchPeople, fetchPlanOptions, fetchPlans,
  fetchProtocolRoster, fetchScheduleOptions, fetchSongs, fetchWork, fetchWorkOptions, recordDonation, recordMoneyEntry, saveBudgetLine,
  type BudgetKind, type MoneyEntryKind, type PlanType, type ProtocolOffice, type ProtocolServeDays, type SlotKind,
} from '../../api/frontDoorApi';
import {
  matchName, parseAmount, parseDate, parseDateTime, parseMonth, resolvePerson, type FieldDef, type Found, type Issue, type PersonLite, type Verdict,
} from './engine';

export interface ImportTarget<Row = never, Ctx = never> {
  key: string;
  back: (systemId: string) => string;
  fields: FieldDef[];
  load: (systemId: string, records: Array<Record<string, string>>) => Promise<Ctx>;
  judge: (values: Record<string, string>, ctx: Ctx) => Verdict<Row>;
  /** Two lines with the same key are the same record. */
  same: (row: Row) => string;
  save: (row: Row, ctx: Ctx, systemId: string) => Promise<void>;
}

const k = (...parts: Array<string | number | null | undefined>) => parts.map((p) => String(p ?? '').toLowerCase().trim().replace(/\s+/g, ' ')).join('|');
const fail = (label: string, code: Issue['code'], field?: string, value?: string): Verdict<never> => ({ label, issue: { code, field, value } });
const required = (label: string, field: string) => fail(label, 'required', field);
const LONG = 2000;

/** Look a person up in the directory the person importing is allowed to see. */
function person(people: PersonLite[], value: string, field: string, label: string): { id: string; name: string } | Verdict<never> {
  const f: Found<PersonLite> = resolvePerson(people, value);
  if (f.kind === 'one') return { id: f.item.id, name: f.item.fullName };
  return fail(label, f.kind === 'many' ? 'ambiguous' : value.trim() ? 'notFound' : 'required', field, value);
}
const isVerdict = (x: unknown): x is Verdict<never> => !!x && typeof x === 'object' && 'label' in x;

const year = (raw: string): number | null => (raw.trim() === '' ? new Date().getFullYear() : /^\d{4}$/.test(raw.trim()) ? Number(raw) : null);

const directory = (systemId: string) => fetchPeople({ systemId });

function choice<T extends string>(raw: string, map: Record<string, T>, fallback: T | null): T | null {
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  return map[v] ?? null;
}

/* ───────── Work ───────── */

interface UnitCtx { people: PersonLite[]; units: Array<{ id: string; name: string }>; existing: Set<string> }

function unitFor(ctx: UnitCtx, raw: string, label: string): { id: string } | Verdict<never> {
  if (!raw.trim()) return ctx.units.length === 1 ? { id: ctx.units[0]!.id } : ctx.units.length === 0 ? fail(label, 'notFound', 'Unit') : required(label, 'Unit');
  const f = matchName(ctx.units, (u) => u.name, raw);
  return f.kind === 'one' ? { id: f.item.id } : fail(label, f.kind === 'many' ? 'ambiguous' : 'notFound', 'Unit', raw);
}

interface TaskRow { unitId: string; title: string; description: string | null; ownerId: string; dueDate: string | null }
export const tasksTarget: ImportTarget<TaskRow, UnitCtx> = {
  key: 'tasks',
  back: (s) => `/s/${s}/work`,
  fields: [
    { key: 'title', header: 'Title', aliases: ['task', 'umurimo', 'tache', 'tâche'], required: true, example: 'Prepare the harvest programme' },
    { key: 'owner', header: 'Owner', aliases: ['responsible', 'person', 'assigned to', 'nyirabyo', 'responsable'], required: true, example: 'M-00123' },
    { key: 'due', header: 'Due date', aliases: ['date', 'deadline', 'itariki', 'echeance', 'échéance'], example: '2026-11-15' },
    { key: 'description', header: 'Description', aliases: ['details', 'notes', 'ibisobanuro'], example: '' },
    { key: 'unit', header: 'Unit', aliases: ['group', 'ishami', 'unité'], example: '' },
  ],
  async load(systemId) {
    const [people, options, work] = await Promise.all([directory(systemId), fetchWorkOptions(), fetchWork({ systemId, view: 'all', status: 'all' })]);
    const units = options.units.filter((u) => u.systemId === systemId);
    return { people, units, existing: new Set(work.map((w) => k(w.orgUnitId, w.title))) };
  },
  judge(v, ctx) {
    const label = v.title ?? '';
    if (!label) return required(label, 'Title');
    if (label.length > 200 || (v.description ?? '').length > LONG) return fail(label, 'tooLong', 'Title');
    const owner = person(ctx.people, v.owner ?? '', 'Owner', label);
    if (isVerdict(owner)) return owner;
    const unit = unitFor(ctx, v.unit ?? '', label);
    if (isVerdict(unit)) return unit;
    let dueDate: string | null = null;
    if (v.due) {
      dueDate = parseDate(v.due);
      if (!dueDate) return fail(label, 'badDate', 'Due date', v.due);
    }
    return { label, row: { unitId: unit.id, title: label, description: v.description || null, ownerId: owner.id, dueDate }, duplicate: ctx.existing.has(k(unit.id, label)) };
  },
  same: (r) => k(r.unitId, r.title),
  save: (r) => createWork(r.unitId, { title: r.title, description: r.description, ownerId: r.ownerId, helperIds: [], dueDate: r.dueDate, visibility: 'UNIT' }).then(() => undefined),
};

interface PlanRow { unitId: string; planType: PlanType; title: string; aim: string; needs: string | null; location: string | null; startsOn: string | null; endsOn: string | null; leaderId: string }
export const plansTarget: ImportTarget<PlanRow, UnitCtx> = {
  key: 'plans',
  back: (s) => `/s/${s}/programs`,
  fields: [
    { key: 'type', header: 'Type', aliases: ['kind', 'ubwoko'], required: true, example: 'program' },
    { key: 'title', header: 'Title', aliases: ['name', 'izina', 'titre'], required: true, example: 'Youth week' },
    { key: 'aim', header: 'Aim', aliases: ['purpose', 'goal', 'intego', 'objectif'], required: true, example: 'Bring young people closer to the church' },
    { key: 'leader', header: 'Leader', aliases: ['owner', 'responsible', 'umuyobozi', 'responsable'], required: true, example: 'M-00123' },
    { key: 'starts', header: 'Starts', aliases: ['start', 'from', 'itangira', 'debut', 'début'], example: '2026-11-01' },
    { key: 'ends', header: 'Ends', aliases: ['end', 'to', 'irangira', 'fin'], example: '2026-11-07' },
    { key: 'location', header: 'Location', aliases: ['place', 'venue', 'aho', 'lieu'], example: '' },
    { key: 'needs', header: 'Needs', aliases: ['requirements', 'ibikenewe', 'besoins'], example: '' },
    { key: 'unit', header: 'Unit', aliases: ['group', 'ishami'], example: '' },
  ],
  async load(systemId) {
    const [people, options, plans] = await Promise.all([directory(systemId), fetchPlanOptions(), fetchPlans({ systemId, view: 'all' })]);
    const units = options.units.filter((u) => u.systemId === systemId);
    return { people, units, existing: new Set(plans.map((p) => k(p.orgUnitId, p.planType, p.title))) };
  },
  judge(v, ctx) {
    const label = v.title ?? '';
    if (!label) return required(label, 'Title');
    const planType = choice<PlanType>(v.type ?? '', { program: 'PROGRAM', programme: 'PROGRAM', event: 'EVENT', evenement: 'EVENT', événement: 'EVENT', project: 'PROJECT', projet: 'PROJECT' }, null);
    if (!planType) return fail(label, v.type ? 'badChoice' : 'required', 'Type', v.type);
    if (!v.aim) return required(label, 'Aim');
    if (label.length > 200 || v.aim.length > LONG) return fail(label, 'tooLong', 'Title');
    const leader = person(ctx.people, v.leader ?? '', 'Leader', label);
    if (isVerdict(leader)) return leader;
    const unit = unitFor(ctx, v.unit ?? '', label);
    if (isVerdict(unit)) return unit;
    const startsOn = v.starts ? parseDate(v.starts) : null;
    const endsOn = v.ends ? parseDate(v.ends) : null;
    if (v.starts && !startsOn) return fail(label, 'badDate', 'Starts', v.starts);
    if (v.ends && !endsOn) return fail(label, 'badDate', 'Ends', v.ends);
    if (startsOn && endsOn && endsOn < startsOn) return fail(label, 'badDate', 'Ends', v.ends);
    return {
      label,
      row: { unitId: unit.id, planType, title: label, aim: v.aim, needs: v.needs || null, location: v.location || null, startsOn, endsOn, leaderId: leader.id },
      duplicate: ctx.existing.has(k(unit.id, planType, label)),
    };
  },
  same: (r) => k(r.unitId, r.planType, r.title),
  save: (r) =>
    createPlan(r.unitId, { title: r.title, aim: r.aim, needs: r.needs, location: r.location, startsOn: r.startsOn, endsOn: r.endsOn, leaderId: r.leaderId, team: [], beyondUnit: false, visibility: 'UNIT', planType: r.planType }).then(() => undefined),
};

/* ───────── Members in groups, choirs and the Protocol roster ───────── */

interface MemberCtx { people: PersonLite[]; containers: Array<{ id: string; name: string }>; members: Map<string, Set<string>> }
interface MemberRow { containerId: string; personId: string; name: string }

const memberFields = (containerHeader: string, aliases: string[], example: string): FieldDef[] => [
  { key: 'container', header: containerHeader, aliases, required: true, example },
  { key: 'person', header: 'Person', aliases: ['member', 'name', 'umunyamuryango', 'membre', 'code', 'phone', 'email'], required: true, example: 'M-00123' },
];

function memberJudge(v: Record<string, string>, ctx: MemberCtx, containerHeader: string): Verdict<MemberRow> {
  const label = v.person ?? '';
  if (!label) return required(label, 'Person');
  const c = matchName(ctx.containers, (x) => x.name, v.container ?? '');
  if (c.kind !== 'one') return fail(label, c.kind === 'many' ? 'ambiguous' : v.container ? 'notFound' : 'required', containerHeader, v.container);
  const p = person(ctx.people, label, 'Person', label);
  if (isVerdict(p)) return p;
  return { label: `${p.name} → ${c.item.name}`, row: { containerId: c.item.id, personId: p.id, name: p.name }, duplicate: ctx.members.get(c.item.id)?.has(p.id) ?? false };
}

export const groupMembersTarget: ImportTarget<MemberRow, MemberCtx> = {
  key: 'groupMembers',
  back: (s) => `/s/${s}/groups`,
  fields: memberFields('Group', ['class', 'fellowship', 'ishuri', 'itsinda', 'groupe'], 'Sunday school 1'),
  async load(systemId) {
    const [people, groups] = await Promise.all([directory(systemId), fetchGroups(systemId)]);
    const active = groups.groups.filter((g) => g.status === 'ACTIVE');
    const details = await Promise.all(active.map((g) => fetchGroup(g.id)));
    return { people, containers: active.map((g) => ({ id: g.id, name: g.name })), members: new Map(details.map((d) => [d.group.id, new Set(d.members.map((m) => m.personId))])) };
  },
  judge: (v, ctx) => memberJudge(v, ctx, 'Group'),
  same: (r) => k(r.containerId, r.personId),
  save: (r) => addGroupMember(r.containerId, r.personId),
};

export const choirMembersTarget: ImportTarget<MemberRow, MemberCtx> = {
  key: 'choirMembers',
  back: (s) => `/s/${s}/choirs`,
  fields: memberFields('Choir', ['korali', 'chorale', 'group'], 'Youth choir'),
  async load(systemId) {
    const [people, choirs] = await Promise.all([directory(systemId), fetchChoirs()]);
    const active = choirs.choirs.filter((c) => c.active);
    const details = await Promise.all(active.map((c) => fetchChoir(c.id)));
    return { people, containers: active.map((c) => ({ id: c.id, name: c.name })), members: new Map(details.map((d) => [d.choir.id, new Set(d.members.map((m) => m.personId))])) };
  },
  judge: (v, ctx) => memberJudge(v, ctx, 'Choir'),
  same: (r) => k(r.containerId, r.personId),
  save: (r) => addChoirMember(r.containerId, r.personId),
};

interface RosterCtx { people: PersonLite[]; onRoster: Set<string> }
interface RosterRow { personId: string; office: ProtocolOffice; serveDays: ProtocolServeDays }
const OFFICES: Record<string, ProtocolOffice> = {
  president: 'PRESIDENT', 'vice president': 'VP', vp: 'VP', secretary: 'SECRETARY', treasurer: 'TREASURER', coordinator: 'COORDINATOR', member: 'MEMBER',
  perezida: 'PRESIDENT', umunyamabanga: 'SECRETARY', 'umubitsi': 'TREASURER', secretaire: 'SECRETARY', secrétaire: 'SECRETARY', tresorier: 'TREASURER', trésorier: 'TREASURER', coordinateur: 'COORDINATOR', membre: 'MEMBER',
};
const DAYS: Record<string, ProtocolServeDays> = { sunday: 'SUNDAY', sunday1: 'SUNDAY', tuesday: 'TUESDAY', both: 'BOTH', 'sunday and tuesday': 'BOTH', dimanche: 'SUNDAY', mardi: 'TUESDAY', byombi: 'BOTH', tous: 'BOTH' };
export const protocolRosterTarget: ImportTarget<RosterRow, RosterCtx> = {
  key: 'protocolRoster',
  back: (s) => `/s/${s}/roster`,
  fields: [
    { key: 'person', header: 'Person', aliases: ['member', 'name', 'code', 'phone', 'email', 'umunyamuryango', 'membre'], required: true, example: 'M-00123' },
    { key: 'office', header: 'Office', aliases: ['role', 'position', 'umwanya', 'fonction'], example: 'member' },
    { key: 'days', header: 'Serves on', aliases: ['serve days', 'days', 'iminsi', 'jours'], example: 'both' },
  ],
  async load(systemId) {
    const [people, roster] = await Promise.all([directory(systemId), fetchProtocolRoster()]);
    return { people, onRoster: new Set(roster.members.map((m) => m.personId)) };
  },
  judge(v, ctx) {
    const label = v.person ?? '';
    if (!label) return required(label, 'Person');
    const p = person(ctx.people, label, 'Person', label);
    if (isVerdict(p)) return p;
    const office = choice(v.office ?? '', OFFICES, 'MEMBER');
    if (!office) return fail(p.name, 'badChoice', 'Office', v.office);
    const serveDays = choice(v.days ?? '', DAYS, 'BOTH');
    if (!serveDays) return fail(p.name, 'badChoice', 'Serves on', v.days);
    return { label: p.name, row: { personId: p.id, office, serveDays }, duplicate: ctx.onRoster.has(p.id) };
  },
  same: (r) => r.personId,
  save: (r) => addProtocolMember(r.personId, r.office, r.serveDays).then(() => undefined),
};

/* ───────── Money ───────── */

interface MoneyCtx { accounts: Array<{ id: string; name: string }>; categories: string[]; existing: Set<string> }
interface EntryRow { accountId: string; kind: MoneyEntryKind; amount: number; occurredOn: string; category: string; note: string | null }
const KINDS: Record<string, MoneyEntryKind> = { income: 'INCOME', in: 'INCOME', receipt: 'INCOME', entree: 'INCOME', entrée: 'INCOME', winjiye: 'INCOME', spending: 'SPENDING', expense: 'SPENDING', out: 'SPENDING', sortie: 'SPENDING', depense: 'SPENDING', dépense: 'SPENDING', yasohotse: 'SPENDING' };

export const moneyEntriesTarget: ImportTarget<EntryRow, MoneyCtx> = {
  key: 'moneyEntries',
  back: (s) => `/s/${s}/money`,
  fields: [
    { key: 'account', header: 'Account', aliases: ['konti', 'compte'], required: true, example: 'Main account' },
    { key: 'kind', header: 'Kind', aliases: ['type', 'income or spending', 'ubwoko'], required: true, example: 'income' },
    { key: 'amount', header: 'Amount', aliases: ['amafaranga', 'montant', 'rwf'], required: true, example: '25000' },
    { key: 'date', header: 'Date', aliases: ['occurred on', 'itariki'], required: true, example: '2026-10-04' },
    { key: 'category', header: 'Category', aliases: ['icyiciro', 'catégorie', 'categorie'], required: true, example: '' },
    { key: 'note', header: 'Note', aliases: ['description', 'ibisobanuro', 'remarque'], example: '' },
  ],
  async load(systemId) {
    const [accounts, options, entries] = await Promise.all([fetchMoneyAccounts(systemId), fetchMoneyOptions(), fetchMoneyEntries({ systemId })]);
    return {
      accounts: accounts.accounts.filter((a) => a.status === 'ACTIVE').map((a) => ({ id: a.id, name: a.name })),
      categories: options.categories,
      existing: new Set(entries.filter((e) => e.status !== 'VOIDED' && e.status !== 'REJECTED').map((e) => k(e.accountId, e.kind, e.amount, e.occurredOn.slice(0, 10), e.category))),
    };
  },
  judge(v, ctx) {
    const label = [v.account, v.date, v.amount].filter(Boolean).join(' · ');
    const a = matchName(ctx.accounts, (x) => x.name, v.account ?? '');
    if (a.kind !== 'one') return fail(label, a.kind === 'many' ? 'ambiguous' : v.account ? 'notFound' : 'required', 'Account', v.account);
    const kind = choice(v.kind ?? '', KINDS, null);
    if (!kind) return fail(label, v.kind ? 'badChoice' : 'required', 'Kind', v.kind);
    const amount = parseAmount(v.amount ?? '');
    if (amount === null) return fail(label, v.amount ? 'badNumber' : 'required', 'Amount', v.amount);
    const occurredOn = parseDate(v.date ?? '');
    if (!occurredOn) return fail(label, v.date ? 'badDate' : 'required', 'Date', v.date);
    const cat = matchName(ctx.categories.map((c) => ({ c })), (x) => x.c, v.category ?? '');
    if (cat.kind !== 'one') return fail(label, v.category ? 'badChoice' : 'required', 'Category', v.category);
    const category = cat.item.c;
    if ((v.note ?? '').length > LONG) return fail(label, 'tooLong', 'Note');
    return { label, row: { accountId: a.item.id, kind, amount, occurredOn, category, note: v.note || null }, duplicate: ctx.existing.has(k(a.item.id, kind, amount, occurredOn, category)) };
  },
  same: (r) => k(r.accountId, r.kind, r.amount, r.occurredOn, r.category, r.note),
  save: (r) => recordMoneyEntry({ accountId: r.accountId, kind: r.kind, amount: r.amount, occurredOn: r.occurredOn, category: r.category, note: r.note }),
};

interface BudgetCtx { categories: string[]; years: Set<number>; existing: Set<string> }
interface BudgetRow { year: number; kind: BudgetKind; category: string; planned: number; note: string | null }
export const budgetLinesTarget: ImportTarget<BudgetRow, BudgetCtx> = {
  key: 'budgetLines',
  back: (s) => `/s/${s}/money/budget`,
  fields: [
    { key: 'kind', header: 'Kind', aliases: ['type', 'income or spending', 'ubwoko'], required: true, example: 'spending' },
    { key: 'category', header: 'Category', aliases: ['icyiciro', 'catégorie', 'categorie'], required: true, example: '' },
    { key: 'planned', header: 'Planned amount', aliases: ['amount', 'planned', 'budget', 'amafaranga', 'montant'], required: true, example: '500000' },
    { key: 'year', header: 'Year', aliases: ['umwaka', 'année', 'annee'], example: String(new Date().getFullYear()) },
    { key: 'note', header: 'Note', aliases: ['ibisobanuro', 'remarque'], example: '' },
  ],
  async load(systemId, records) {
    const wanted = new Set<number>(records.map((r) => year(r.year ?? '')).filter((y): y is number => y !== null));
    const [options, ...budgets] = await Promise.all([fetchMoneyOptions(), ...[...wanted].map((y) => fetchBudget(systemId, y))]);
    const existing = new Set<string>();
    [...wanted].forEach((y, i) => budgets[i]!.lines.forEach((l) => existing.add(k(y, l.kind, l.category))));
    return { categories: options.categories, years: wanted, existing };
  },
  judge(v, ctx) {
    const label = [v.category, v.planned].filter(Boolean).join(' · ');
    const kind = choice(v.kind ?? '', { ...KINDS } as Record<string, string>, null) as MoneyEntryKind | null;
    if (!kind) return fail(label, v.kind ? 'badChoice' : 'required', 'Kind', v.kind);
    const y = year(v.year ?? '');
    if (y === null) return fail(label, 'badNumber', 'Year', v.year);
    const planned = parseAmount(v.planned ?? '');
    if (planned === null) return fail(label, v.planned ? 'badNumber' : 'required', 'Planned amount', v.planned);
    const cat = matchName(ctx.categories.map((c) => ({ c })), (x) => x.c, v.category ?? '');
    if (cat.kind !== 'one') return fail(label, v.category ? 'badChoice' : 'required', 'Category', v.category);
    return { label: `${y} · ${label}`, row: { year: y, kind, category: cat.item.c, planned, note: v.note || null }, duplicate: ctx.existing.has(k(y, kind, cat.item.c)) };
  },
  same: (r) => k(r.year, r.kind, r.category),
  save: (r, _c, systemId) => saveBudgetLine({ systemId, year: r.year, kind: r.kind, category: r.category, planned: r.planned, note: r.note }),
};

interface PlanItemCtx { categories: string[]; existing: Set<string> }
interface PlanItemRow { year: number; title: string; amount: number; dueMonth: string | null; category: string | null; note: string | null }
export const planItemsTarget: ImportTarget<PlanItemRow, PlanItemCtx> = {
  key: 'planItems',
  back: (s) => `/s/${s}/money/plan`,
  fields: [
    { key: 'title', header: 'Title', aliases: ['activity', 'izina', 'titre'], required: true, example: 'Buy chairs' },
    { key: 'amount', header: 'Estimated cost', aliases: ['amount', 'cost', 'amafaranga', 'montant'], required: true, example: '300000' },
    { key: 'month', header: 'Due month', aliases: ['due', 'month', 'ukwezi', 'mois'], example: '2026-12' },
    { key: 'category', header: 'Category', aliases: ['icyiciro', 'catégorie'], example: '' },
    { key: 'year', header: 'Year', aliases: ['umwaka', 'année'], example: String(new Date().getFullYear()) },
    { key: 'note', header: 'Note', aliases: ['ibisobanuro', 'remarque'], example: '' },
  ],
  async load(systemId, records) {
    const wanted = [...new Set(records.map((r) => year(r.year ?? '')).filter((y): y is number => y !== null))];
    const [options, ...plans] = await Promise.all([fetchMoneyOptions(), ...wanted.map((y) => fetchMoneyPlan(systemId, y))]);
    const existing = new Set<string>();
    wanted.forEach((y, i) => plans[i]!.items.forEach((it) => existing.add(k(y, it.title))));
    return { categories: options.categories, existing };
  },
  judge(v, ctx) {
    const label = v.title ?? '';
    if (!label) return required(label, 'Title');
    const y = year(v.year ?? '');
    if (y === null) return fail(label, 'badNumber', 'Year', v.year);
    const amount = parseAmount(v.amount ?? '');
    if (amount === null) return fail(label, v.amount ? 'badNumber' : 'required', 'Estimated cost', v.amount);
    let dueMonth: string | null = null;
    if (v.month) {
      dueMonth = parseMonth(v.month);
      if (!dueMonth) return fail(label, 'badDate', 'Due month', v.month);
    }
    let category: string | null = null;
    if (v.category) {
      const cat = matchName(ctx.categories.map((c) => ({ c })), (x) => x.c, v.category);
      if (cat.kind !== 'one') return fail(label, 'badChoice', 'Category', v.category);
      category = cat.item.c;
    }
    return { label: `${y} · ${label}`, row: { year: y, title: label, amount, dueMonth, category, note: v.note || null }, duplicate: ctx.existing.has(k(y, label)) };
  },
  same: (r) => k(r.year, r.title),
  save: (r, _c, systemId) => addMoneyPlanItem({ systemId, year: r.year, title: r.title, amount: r.amount, dueMonth: r.dueMonth, category: r.category, note: r.note }),
};

interface DonationCtx { accounts: Array<{ id: string; name: string }>; existing: Set<string> }
interface DonationRow { accountId: string; donorName: string; amount: number; receivedOn: string; note: string | null }
export const donationsTarget: ImportTarget<DonationRow, DonationCtx> = {
  key: 'donations',
  back: (s) => `/s/${s}/money/contributions`,
  fields: [
    { key: 'account', header: 'Account', aliases: ['konti', 'compte'], required: true, example: 'Main account' },
    { key: 'donor', header: 'Donor', aliases: ['name', 'giver', 'umuterankunga', 'donateur'], required: true, example: 'Aline Mukamana' },
    { key: 'amount', header: 'Amount', aliases: ['amafaranga', 'montant'], required: true, example: '50000' },
    { key: 'date', header: 'Received on', aliases: ['date', 'itariki', 'reçu le'], required: true, example: '2026-10-04' },
    { key: 'note', header: 'Note', aliases: ['ibisobanuro', 'remarque'], example: '' },
  ],
  async load(systemId) {
    const [accounts, donations] = await Promise.all([fetchMoneyAccounts(systemId), fetchDonations(systemId)]);
    return {
      accounts: accounts.accounts.filter((a) => a.status === 'ACTIVE').map((a) => ({ id: a.id, name: a.name })),
      existing: new Set(donations.donations.filter((d) => d.status !== 'REJECTED').map((d) => k(d.donorName, d.amount, d.receivedOn.slice(0, 10)))),
    };
  },
  judge(v, ctx) {
    const label = [v.donor, v.amount].filter(Boolean).join(' · ');
    if (!v.donor) return required(label, 'Donor');
    const a = matchName(ctx.accounts, (x) => x.name, v.account ?? '');
    if (a.kind !== 'one') return fail(label, a.kind === 'many' ? 'ambiguous' : v.account ? 'notFound' : 'required', 'Account', v.account);
    const amount = parseAmount(v.amount ?? '');
    if (amount === null) return fail(label, v.amount ? 'badNumber' : 'required', 'Amount', v.amount);
    const receivedOn = parseDate(v.date ?? '');
    if (!receivedOn) return fail(label, v.date ? 'badDate' : 'required', 'Received on', v.date);
    return { label, row: { accountId: a.item.id, donorName: v.donor, amount, receivedOn, note: v.note || null }, duplicate: ctx.existing.has(k(v.donor, amount, receivedOn)) };
  },
  same: (r) => k(r.accountId, r.donorName, r.amount, r.receivedOn),
  save: (r, _c, systemId) => recordDonation({ systemId, accountId: r.accountId, donorName: r.donorName, amount: r.amount, receivedOn: r.receivedOn, note: r.note }),
};

/* ───────── Music and services ───────── */

interface SongCtx { choirs: Array<{ id: string; name: string }>; songs: Map<string, Set<string>> }
interface SongRow { choirId: string; title: string; composer: string | null; songKey: string | null }
export const songsTarget: ImportTarget<SongRow, SongCtx> = {
  key: 'songs',
  back: (s) => `/s/${s}/repertoire`,
  fields: [
    { key: 'choir', header: 'Choir', aliases: ['korali', 'chorale'], required: true, example: 'Youth choir' },
    { key: 'title', header: 'Song', aliases: ['title', 'indirimbo', 'chant', 'titre'], required: true, example: 'Nzaririmba' },
    { key: 'composer', header: 'Composer', aliases: ['author', 'umuhimbyi', 'compositeur'], example: '' },
    { key: 'key', header: 'Key', aliases: ['song key', 'tone', 'ton'], example: 'G' },
  ],
  async load() {
    const choirs = (await fetchChoirs()).choirs.filter((c) => c.active);
    const lists = await Promise.all(choirs.map((c) => fetchSongs(c.id)));
    return { choirs: choirs.map((c) => ({ id: c.id, name: c.name })), songs: new Map(choirs.map((c, i) => [c.id, new Set(lists[i]!.songs.map((s) => k(s.title)))])) };
  },
  judge(v, ctx) {
    const label = v.title ?? '';
    if (!label) return required(label, 'Song');
    const c = matchName(ctx.choirs, (x) => x.name, v.choir ?? '');
    if (c.kind !== 'one') return fail(label, c.kind === 'many' ? 'ambiguous' : v.choir ? 'notFound' : 'required', 'Choir', v.choir);
    if (label.length > 200) return fail(label, 'tooLong', 'Song');
    return { label: `${label} → ${c.item.name}`, row: { choirId: c.item.id, title: label, composer: v.composer || null, songKey: v.key || null }, duplicate: ctx.songs.get(c.item.id)?.has(k(label)) ?? false };
  },
  same: (r) => k(r.choirId, r.title),
  save: (r) => addSong({ choirId: r.choirId, title: r.title, composer: r.composer, songKey: r.songKey }),
};

interface SlotCtx { units: Array<{ id: string; name: string }>; existing: Set<string> }
interface SlotRow { unitId: string; title: string; kind: SlotKind; startsAt: string; endsAt: string | null; location: string | null; notes: string | null }
const SLOT_KINDS: Record<string, SlotKind> = { service: 'SERVICE', igiterane: 'SERVICE', culte: 'SERVICE', rehearsal: 'REHEARSAL', imyitozo: 'REHEARSAL', repetition: 'REHEARSAL', répétition: 'REHEARSAL', meeting: 'MEETING', inama: 'MEETING', reunion: 'MEETING', réunion: 'MEETING', other: 'OTHER', autre: 'OTHER' };
export const slotsTarget: ImportTarget<SlotRow, SlotCtx> = {
  key: 'scheduleSlots',
  back: (s) => `/s/${s}/schedule`,
  fields: [
    { key: 'title', header: 'Title', aliases: ['name', 'izina', 'titre'], required: true, example: 'Choir rehearsal' },
    { key: 'starts', header: 'Starts', aliases: ['start', 'date', 'date and time', 'itangira', 'debut', 'début'], required: true, example: '2026-10-10 17:00' },
    { key: 'kind', header: 'Kind', aliases: ['type', 'ubwoko'], example: 'rehearsal' },
    { key: 'ends', header: 'Ends', aliases: ['end', 'irangira', 'fin'], example: '2026-10-10 19:00' },
    { key: 'location', header: 'Location', aliases: ['place', 'venue', 'aho', 'lieu'], example: '' },
    { key: 'notes', header: 'Notes', aliases: ['note', 'ibisobanuro', 'remarque'], example: '' },
    { key: 'unit', header: 'Unit', aliases: ['group', 'ishami'], example: '' },
  ],
  async load(systemId, records) {
    const options = await fetchScheduleOptions();
    const units = options.units.filter((u) => u.systemId === systemId);
    const months = [...new Set(records.map((r) => parseDateTime(r.starts ?? '')).filter((s): s is string => !!s).map((s) => s.slice(0, 7)))];
    const views = await Promise.all(months.map((m) => fetchMonth(systemId, m)));
    const existing = new Set<string>();
    views.forEach((mv) => mv.units.forEach((u) => u.slots.forEach((s) => existing.add(k(u.unitId, s.title, s.startsAt)))));
    return { units, existing };
  },
  judge(v, ctx) {
    const label = [v.title, v.starts].filter(Boolean).join(' · ');
    if (!v.title) return required(label, 'Title');
    const startsAt = parseDateTime(v.starts ?? '');
    if (!startsAt) return fail(label, v.starts ? 'badDate' : 'required', 'Starts', v.starts);
    let endsAt: string | null = null;
    if (v.ends) {
      endsAt = parseDateTime(v.ends);
      if (!endsAt || endsAt < startsAt) return fail(label, 'badDate', 'Ends', v.ends);
    }
    const kind = choice(v.kind ?? '', SLOT_KINDS, 'OTHER');
    if (!kind) return fail(label, 'badChoice', 'Kind', v.kind);
    const unit = unitFor({ people: [], units: ctx.units, existing: ctx.existing }, v.unit ?? '', label);
    if (isVerdict(unit)) return unit;
    return {
      label,
      row: { unitId: unit.id, title: v.title, kind, startsAt, endsAt, location: v.location || null, notes: v.notes || null },
      duplicate: ctx.existing.has(k(unit.id, v.title, startsAt)) || [...ctx.existing].some((e) => e === k(unit.id, v.title, startsAt.replace('.000Z', 'Z'))),
    };
  },
  same: (r) => k(r.unitId, r.title, r.startsAt),
  save: (r) => addSlot(r.unitId, { title: r.title, kind: r.kind, startsAt: r.startsAt, endsAt: r.endsAt, location: r.location, notes: r.notes, churchWide: false }),
};

export const TARGETS = {
  tasks: tasksTarget,
  plans: plansTarget,
  groupMembers: groupMembersTarget,
  choirMembers: choirMembersTarget,
  protocolRoster: protocolRosterTarget,
  moneyEntries: moneyEntriesTarget,
  budgetLines: budgetLinesTarget,
  planItems: planItemsTarget,
  donations: donationsTarget,
  songs: songsTarget,
  scheduleSlots: slotsTarget,
} as const;
export type TargetKey = keyof typeof TARGETS;
export const isTargetKey = (s: string): s is TargetKey => s in TARGETS;
