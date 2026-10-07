/**
 * Home dashboards (slice 3.14): the few figures and small charts shown on a system's Home.
 * Every figure is added only when the caller holds the letter that opens the record behind it,
 * so a dashboard never tells anyone more than the pages it links to. Nothing here changes data.
 * Collections (offering counts) are never combined with money.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { lettersInSystem } from '../capabilities/engine.js';
import { canSee, type WorkRow } from '../work/rules.js';
import { balances } from '../money/rules.js';
import { lastMonths, monthOf, sumByMonth, type Series, type Tile } from '../glance/rules.js';

export const glanceRouter = Router();

interface MemberRow { personId: string; systemId?: string | null; status: string }
interface TaskRow extends WorkRow { dueDate?: Date | string | null }
interface EntryRow { kind: string; amount: number; status: string; occurredOn: Date | string; systemId: string }
interface GroupRow { id: string; systemId: string; status: string }
interface SessionRow { groupId: string; heldOn: Date | string; presentJson: string }
interface ContactRow { status: string }
interface RowWithStatus { systemId: string; status: string }

const safeCount = (json: string): number => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
};

glanceRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = String(req.query.systemId ?? '');
  if (!systemId) return res.status(400).json({ error: 'systemId is required', code: 'BAD_REQUEST' });
  const now = new Date();
  const { data } = await loadAccessData(me);
  const letters = lettersInSystem(me, systemId, data, now);
  const has = (m: 'PEOPLE' | 'MONEY' | 'SCHEDULING' | 'MISSION') => (letters[m] as string[]).includes('R');
  const tiles: Tile[] = [];
  const series: Series[] = [];
  const months = lastMonths(now);

  // Work: only what this person may see (the same rule as the work list).
  const tasks = ((await prisma.workTask.findMany({ where: { systemId } })) as TaskRow[]).filter((w) => w.systemId === systemId && canSee(w, me, data, now));
  const open = tasks.filter((w) => w.status === 'TODO' || w.status === 'IN_PROGRESS');
  if (tasks.length > 0 || has('MISSION')) {
    tiles.push({ key: 'work.open', value: open.length, format: 'count', href: `/s/${systemId}/work` });
    const overdue = open.filter((w) => w.dueDate && new Date(w.dueDate).getTime() < now.getTime()).length;
    if (overdue > 0) tiles.push({ key: 'work.overdue', value: overdue, format: 'count', tone: 'warn', href: `/s/${systemId}/work` });
  }

  if (has('PEOPLE')) {
    const members = (await prisma.membership.findMany({ where: { systemId } })) as MemberRow[];
    const ids = new Set(members.filter((m) => m.systemId === systemId && m.status === 'ACTIVE').map((m) => m.personId));
    tiles.push({ key: 'people.members', value: ids.size, format: 'count', href: `/s/${systemId}/people` });

    const groups = ((await prisma.unitGroup.findMany({ where: { systemId } })) as GroupRow[]).filter((g) => g.systemId === systemId && g.status === 'ACTIVE');
    if (groups.length > 0) {
      tiles.push({ key: 'groups.active', value: groups.length, format: 'count', href: `/s/${systemId}/groups` });
      const gid = new Set(groups.map((g) => g.id));
      const sessions = ((await prisma.groupSession.findMany()) as SessionRow[]).filter((s) => gid.has(s.groupId));
      series.push({ key: 'groups.attendance', format: 'count', points: sumByMonth(sessions, months, (s) => s.heldOn, (s) => safeCount(s.presentJson)) });
    }
    const couples = ((await prisma.couplePair.findMany({ where: { systemId } })) as RowWithStatus[]).filter((c) => c.systemId === systemId && c.status === 'ACTIVE');
    if (couples.length > 0) tiles.push({ key: 'couples.active', value: couples.length, format: 'count', href: `/s/${systemId}/couples` });
    if (systemId === 'sys-evangelism') {
      const contacts = (await prisma.evangelismContact.findMany()) as ContactRow[];
      const count = (s: string) => contacts.filter((c) => c.status === s).length;
      tiles.push({ key: 'contacts.new', value: count('NEW'), format: 'count', tone: count('NEW') > 0 ? 'warn' : undefined, href: `/s/${systemId}/contacts` });
      tiles.push({ key: 'contacts.following', value: count('FOLLOWING'), format: 'count', href: `/s/${systemId}/contacts` });
      tiles.push({ key: 'contacts.joined', value: count('JOINED'), format: 'count', href: `/s/${systemId}/contacts` });
    }
  }

  if (has('SCHEDULING')) {
    const watches = ((await prisma.prayerWatch.findMany({ where: { systemId } })) as RowWithStatus[]).filter((w) => w.systemId === systemId && w.status === 'ACTIVE');
    if (watches.length > 0) tiles.push({ key: 'watches.active', value: watches.length, format: 'count', href: `/s/${systemId}/watches` });
  }

  if (has('MONEY')) {
    const entries = ((await prisma.moneyEntry.findMany({ where: { systemId } })) as EntryRow[]).filter((e) => e.systemId === systemId);
    const thisMonth = monthOf(now);
    const b = balances(entries.filter((e) => monthOf(e.occurredOn) === thisMonth));
    const all = balances(entries);
    tiles.push({ key: 'money.income', value: b.income, format: 'rwf', href: `/s/${systemId}/money` });
    tiles.push({ key: 'money.spent', value: b.spent, format: 'rwf', href: `/s/${systemId}/money` });
    tiles.push({ key: 'money.balance', value: all.balance, format: 'rwf', href: `/s/${systemId}/money` });
    if (all.pending > 0) tiles.push({ key: 'money.pending', value: all.pending, format: 'rwf', tone: 'warn', href: `/s/${systemId}/money` });
    series.push({ key: 'money.income', format: 'rwf', points: sumByMonth(entries.filter((e) => e.kind === 'INCOME' && e.status === 'RECORDED'), months, (e) => e.occurredOn, (e) => e.amount) });
    series.push({ key: 'money.spent', format: 'rwf', points: sumByMonth(entries.filter((e) => e.kind === 'SPENDING' && e.status === 'APPROVED'), months, (e) => e.occurredOn, (e) => e.amount) });
  }

  res.json({ systemId, tiles, series });
});
