/**
 * The leader's dashboard: one page of figures, two charts and three short lists for the system a
 * leader holds an office in. Central Administration looks across the whole church. Every figure is
 * added only when the caller holds the letter that opens the record behind it. Collections
 * (tithes and offerings) are shown only in Central Administration and are never mixed with money.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { lettersInSystem, liveHoldings, reachesEverySystem } from '../capabilities/engine.js';
import { canSee, type WorkRow } from '../work/rules.js';
import { asWorkRow, type PlanRow } from '../work/plan.js';
import { balances } from '../money/rules.js';
import { COLLECTIONS_SYSTEM } from './collections.js';
import { reportsReceived } from './reports.js';
import { canReadReports } from '../reports/access.js';
import { lastMonths, monthOf, percentChange, sumByMonth } from '../glance/rules.js';

export const dashboardRouter = Router();

interface MemberRow { personId: string; systemId?: string | null; type: string; status: string; startDate: Date | string; endDate?: Date | string | null }
interface EntryRow { kind: string; amount: number; status: string; occurredOn: Date | string; systemId: string }
interface CountRow { systemId: string; amount: number; status: string; serviceOn: Date | string }
interface GroupRow { id: string; systemId: string; status: string }
interface SessionRow { groupId: string; heldOn: Date | string; presentJson: string }
interface UnitRow { id: string; systemId?: string | null; kind?: string | null; status?: string | null }
interface TaskRow extends WorkRow { id: string; title: string; status: string; updatedAt?: Date | string | null; createdAt?: Date | string | null }
type PlanFull = PlanRow & { id: string; title: string; planType?: string | null; startsOn?: Date | string | null; endsOn?: Date | string | null; status: string };

const present = (json: string): number => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
};
const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);

dashboardRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = String(req.query.systemId ?? '');
  if (!systemId) return res.status(400).json({ error: 'systemId is required', code: 'BAD_REQUEST' });
  const now = new Date();
  const { data, units } = await loadAccessData(me);
  // Only a leader of this system (or of the whole church) gets a dashboard; others get a plain "not found".
  const leader = liveHoldings(me, data, now).some((h) => reachesEverySystem(h) || (h.scope === 'CHURCH' && systemId === 'sys-main') || h.systemId === systemId);
  if (!leader) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

  const central = systemId === COLLECTIONS_SYSTEM;
  const letters = lettersInSystem(me, systemId, data, now);
  const has = (m: 'PEOPLE' | 'MONEY' | 'SCHEDULING' | 'MISSION' | 'GOVERNANCE') => (letters[m] as string[]).includes('R');
  const months = lastMonths(now);
  const thisMonth = months[months.length - 1]!;
  const lastMonth = months[months.length - 2]!;
  const kpis: Array<{ key: string; value: number; format: 'count' | 'rwf'; trend: number | null; href?: string; tone?: 'late' | 'ok' }> = [];
  // null = this person's letters do not open that part, so the page leaves it out; [] = allowed, nothing yet.
  const lists: { events: unknown[]; members: unknown[] | null; work: unknown[]; reports: unknown[] | null } = { events: [], members: null, work: [], reports: null };
  const overview: Record<string, unknown> = {};
  let attendance: Array<{ label: string; value: number }> | null = null;
  let second: { kind: 'giving' | 'money'; series: Array<{ key: string; points: Array<{ label: string; value: number }> }> } | null = null;

  // People: members, recent joiners, attendance at groups.
  if (has('PEOPLE')) {
    lists.members = [];
    const all = (await prisma.membership.findMany(central ? undefined : { where: { systemId } })) as MemberRow[];
    const scoped = all.filter((m) => (central ? m.type === 'CHURCH_MEMBER' : m.systemId === systemId));
    const countAt = (at: Date) => new Set(scoped.filter((m) => new Date(m.startDate) <= at && (!m.endDate || new Date(m.endDate) > at) && (m.status === 'ACTIVE' || !!m.endDate)).map((m) => m.personId)).size;
    const monthStart = new Date(`${thisMonth}-01T00:00:00Z`);
    const nowCount = new Set(scoped.filter((m) => m.status === 'ACTIVE').map((m) => m.personId)).size;
    const joinedThisMonth = new Set(scoped.filter((m) => m.status === 'ACTIVE' && new Date(m.startDate) >= monthStart).map((m) => m.personId)).size;
    overview.people = { members: nowCount, joinedThisMonth, units: 0 };
    kpis.push({ key: 'members', value: nowCount, format: 'count', trend: percentChange(nowCount, countAt(monthStart)), href: `/s/${systemId}/people` });

    const seen = new Set<string>();
    const recent = scoped
      .filter((m) => m.status === 'ACTIVE')
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .filter((m) => (seen.has(m.personId) ? false : (seen.add(m.personId), true)))
      .slice(0, 4);
    const people = recent.length
      ? ((await prisma.person.findMany({ where: { id: { in: recent.map((m) => m.personId) } } })) as Array<{ id: string; fullName: string }>)
      : [];
    const nameOf = new Map(people.map((p) => [p.id, p.fullName]));
    lists.members = recent.map((m) => ({ personId: m.personId, name: nameOf.get(m.personId) ?? '', joinedOn: iso(m.startDate)!.slice(0, 10), href: `/s/${systemId}/people/${m.personId}` }));

    const groups = ((await prisma.unitGroup.findMany(central ? undefined : { where: { systemId } })) as GroupRow[]).filter((g) => g.status === 'ACTIVE' && (central || g.systemId === systemId));
    if (groups.length > 0) {
      const gid = new Set(groups.map((g) => g.id));
      const sessions = ((await prisma.groupSession.findMany()) as SessionRow[]).filter((s) => gid.has(s.groupId));
      attendance = sumByMonth(sessions, months, (s) => s.heldOn, (s) => present(s.presentJson));
      const last = attendance[attendance.length - 1]!.value;
      const before = attendance[attendance.length - 2]!.value;
      kpis.push({ key: 'attendance', value: last, format: 'count', trend: percentChange(last, before), href: `/s/${systemId}/groups` });
    }
  }

  // Giving (collections) in Central Administration only; money in the other systems. Never added together.
  if (central && has('GOVERNANCE')) {
    const counts = ((await prisma.offeringCount.findMany()) as CountRow[]).filter((c) => c.status !== 'VOIDED');
    const points = sumByMonth(counts, months, (c) => c.serviceOn, (c) => c.amount);
    const cur = points[points.length - 1]!.value;
    kpis.push({ key: 'giving', value: cur, format: 'rwf', trend: percentChange(cur, points[points.length - 2]!.value), href: `/s/${systemId}/collections` });
    second = { kind: 'giving', series: [{ key: 'giving', points }] };
  } else if (!central && has('MONEY')) {
    const entries = ((await prisma.moneyEntry.findMany({ where: { systemId } })) as EntryRow[]).filter((e) => e.systemId === systemId);
    const income = sumByMonth(entries.filter((e) => e.kind === 'INCOME' && e.status === 'RECORDED'), months, (e) => e.occurredOn, (e) => e.amount);
    const spent = sumByMonth(entries.filter((e) => e.kind === 'SPENDING' && e.status === 'APPROVED'), months, (e) => e.occurredOn, (e) => e.amount);
    const b = balances(entries.filter((e) => monthOf(e.occurredOn) === thisMonth));
    kpis.push({ key: 'money', value: b.income, format: 'rwf', trend: percentChange(b.income, income.find((p) => p.label === lastMonth)?.value ?? 0), href: `/s/${systemId}/money` });
    second = { kind: 'money', series: [{ key: 'income', points: income }, { key: 'spent', points: spent }] };
    const all = balances(entries);
    const pendingRows = entries.filter((e) => e.kind === 'SPENDING' && e.status === 'PENDING_APPROVAL');
    const year = now.getUTCFullYear();
    const lines = ((await prisma.moneyBudgetLine.findMany({ where: { systemId } })) as Array<{ systemId: string; year: number; kind: string; planned: number }>).filter((l) => l.systemId === systemId && l.year === year && l.kind === 'SPENDING');
    const spentYear = entries.filter((e) => e.kind === 'SPENDING' && e.status === 'APPROVED' && new Date(e.occurredOn).getUTCFullYear() === year).reduce((a, e) => a + e.amount, 0);
    overview.money = { balance: all.income - all.spent, incomeMonth: b.income, spentMonth: spent[spent.length - 1]!.value, pendingCount: pendingRows.length, pendingAmount: pendingRows.reduce((a, e) => a + e.amount, 0), plannedYear: lines.reduce((a, l) => a + l.planned, 0), spentYear };
  }

  // Units inside this scope.
  const inScope = (units as UnitRow[]).filter((u) => (central ? u.kind === 'MINISTRY' || u.kind === 'ORGANISATION' : u.systemId === systemId) && (u.status ?? 'ACTIVE') === 'ACTIVE');
  if (has('PEOPLE') && overview.people) (overview.people as { units: number }).units = inScope.length;
  if (has('PEOPLE') && inScope.length > 0) kpis.push({ key: 'units', value: inScope.length, format: 'count', trend: null, href: `/s/${systemId}/people/units` });

  // Plans and work this person may see: the upcoming events, and the counts behind the Work overview.
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const visiblePlans = ((await prisma.workPlan.findMany(central ? undefined : { where: { systemId } })) as PlanFull[])
    .filter((p) => (central || p.systemId === systemId) && !p.deletedAt)
    .filter((p) => canSee(asWorkRow(p), me, data, now));
  const plans = visiblePlans
    .filter((p) => (p.planType === 'EVENT' || p.planType === 'PROGRAM') && (p.status === 'SETUP' || p.status === 'RUNNING'))
    .filter((p) => p.startsOn && new Date(p.endsOn ?? p.startsOn).getTime() >= today.getTime())
    .sort((a, b) => new Date(a.startsOn!).getTime() - new Date(b.startsOn!).getTime())
    .slice(0, 4);
  lists.events = plans.map((p) => ({ id: p.id, title: p.title, startsOn: iso(p.startsOn), planType: p.planType, href: `/s/${p.systemId}/work/plans/${p.id}` }));

  const visibleTasks = ((await prisma.workTask.findMany(central ? undefined : { where: { systemId } })) as TaskRow[])
    .filter((w) => (central || w.systemId === systemId) && canSee(w, me, data, now));
  const tasks = [...visibleTasks]
    .sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime())
    .slice(0, 4);
  lists.work = tasks.map((w) => ({ id: w.id, title: w.title, status: w.status, at: iso(w.updatedAt ?? w.createdAt), href: `/s/${w.systemId}/work` }));
  overview.work = {
    openTasks: visibleTasks.filter((w) => w.status !== 'DONE' && w.status !== 'CANCELLED').length,
    plansRunning: visiblePlans.filter((p) => p.status === 'RUNNING' || p.status === 'SETUP').length,
    plansWaiting: visiblePlans.filter((p) => p.status === 'PENDING_APPROVAL').length,
    plansDraft: visiblePlans.filter((p) => p.status === 'DRAFT').length,
  };

  // Schedule: what is coming up in this system.
  if (!central && has('SCHEDULING')) {
    const slots = ((await prisma.scheduleSlot.findMany({ where: { systemId } })) as Array<{ id: string; systemId: string; title: string; kind: string; startsAt: Date | string }>)
      .filter((x) => x.systemId === systemId && new Date(x.startsAt).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .slice(0, 3);
    overview.schedule = { next: slots.map((x) => ({ id: x.id, title: x.title, kind: x.kind, startsAt: iso(x.startsAt) })) };
  }

  // Governance: the next meeting and what is waiting.
  if (has('GOVERNANCE')) {
    const mine = <T extends { systemId: string }>(rows: T[]) => rows.filter((r) => central || r.systemId === systemId);
    const meetings = mine((await prisma.meeting.findMany(central ? undefined : { where: { systemId } })) as Array<{ id: string; systemId: string; title: string; scheduledAt: Date | string; status: string }>)
      .filter((m) => m.status === 'PLANNED' && new Date(m.scheduledAt).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    const decisions = mine((await prisma.decision.findMany(central ? undefined : { where: { systemId } })) as Array<{ systemId: string; status: string }>).filter((d) => d.status === 'DRAFT');
    const letters = mine((await prisma.letter.findMany(central ? undefined : { where: { systemId } })) as Array<{ systemId: string; status: string }>).filter((l) => l.status === 'DRAFT');
    overview.governance = { nextMeeting: meetings[0] ? { id: meetings[0].id, title: meetings[0].title, at: iso(meetings[0].scheduledAt) } : null, decisionsWaiting: decisions.length, lettersOpen: letters.length };
  }

  // Music: which choir serves the coming services, and the choirs themselves.
  if (systemId === 'sys-music') {
    const choirs = ((await prisma.musicChoir.findMany()) as Array<{ id: string; name: string; active: boolean }>).filter((c) => c.active);
    if (has('SCHEDULING')) {
      const nameById = new Map(choirs.map((c) => [c.id, c.name]));
      const doc = (rows: Array<{ periodKey: string; servicesJson: string; assignmentsJson: string }>) =>
        rows.flatMap((r) => {
          try {
            const sv = JSON.parse(r.servicesJson) as Array<{ id: string; date: string; kind: string }>;
            const as = JSON.parse(r.assignmentsJson) as Array<{ serviceId: string; unitId: string }>;
            return sv.map((x) => ({ date: x.date, kind: x.kind, choirs: as.filter((a) => a.serviceId === x.id).map((a) => nameById.get(a.unitId) ?? '').filter(Boolean) }));
          } catch {
            return [];
          }
        });
      const rows = (await prisma.musicMonth.findMany()) as Array<{ periodKey: string; servicesJson: string; assignmentsJson: string }>;
      const next = doc(rows).filter((x) => x.date >= today.toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
      overview.monthPlan = { next, planned: rows.length > 0 };
    }
    if (has('PEOPLE')) {
      const members = (await prisma.musicChoirMember.findMany()) as Array<{ choirId: string; status: string }>;
      const ids = new Set(choirs.map((c) => c.id));
      overview.choirs = { count: choirs.length, members: members.filter((m) => m.status === 'ACTIVE' && ids.has(m.choirId)).length, list: choirs.slice(0, 4).map((c) => ({ name: c.name, members: members.filter((m) => m.status === 'ACTIVE' && m.choirId === c.id).length })) };
    }
  }

  // Reports: only where this person may read them. A ministry sees its own; Central sees what it receives.
  const readsReports = central ? liveHoldings(me, data, now).some((h) => reachesEverySystem(h)) || canReadReports(me, systemId, data, now) : canReadReports(me, systemId, data, now);
  if (readsReports) {
    const got = await reportsReceived(me, data, units as never, now);
    const mine = <T extends { systemId: string }>(rows: T[]) => (central ? rows : rows.filter((r) => r.systemId === systemId));
    const late = mine(got.late);
    const published = mine(got.reports);
    const thisPeriod = published.filter((r) => r.periodKey === thisMonth || r.periodKey === lastMonth).length;
    kpis.push({ key: 'reports', value: late.length > 0 ? late.length : thisPeriod, format: 'count', trend: null, href: `/s/${systemId}/reports`, tone: late.length > 0 ? 'late' : 'ok' });
    lists.reports = [
      ...late.map((r) => ({ id: `late-${r.scheduleId}`, title: r.unitName, kind: r.kind, periodKey: r.periodKey, late: true, href: `/s/${r.systemId}/reports` })),
      ...published.map((r) => ({ id: r.id, title: r.unitName, kind: r.kind, periodKey: r.periodKey, late: false, href: `/s/${r.systemId}/reports/${r.id}` })),
    ].slice(0, 4);
  }

  res.json({ systemId, central, kpis, attendance, second, overview, ...lists });
});
