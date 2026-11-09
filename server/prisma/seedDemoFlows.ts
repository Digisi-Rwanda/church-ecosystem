/**
 * Demo data for trying the two big flows end to end. Runs only where demo accounts are seeded
 * (never on a live deployment). Every row has a fixed id, so running it again changes nothing,
 * and anything the church has already created is left alone.
 *
 *  1. Scheduling: the seven choirs with their members (for the Music month plan) and the
 *     Protocol roster (for the Protocol teams). No month is generated: that is the flow to try.
 *  2. Money and work: for three ministries, a year with an approved budget, an annual money
 *     plan, programs / events / projects in every state, money recorded against them (some
 *     waiting for approval), report schedules, and group attendance for the dashboard.
 */
import type { PrismaClient } from '@prisma/client';
import { seedDemoContent, demoKeep } from './seedDemoContent.js';
import { choirSystemId } from '../src/lib/ministryOrgs.js';

const DAY = 24 * 3600 * 1000;
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

const CHOIRS: Array<{ orgId: string; name: string; role: 'PRIMARY' | 'SECONDARY' | 'CHILDREN' }> = [
  { orgId: 'ou-choir-ijwi', name: "Ijwi ry' umwami Yesu", role: 'PRIMARY' },
  { orgId: 'ou-choir-elbethel', name: "El bethel", role: 'PRIMARY' },
  { orgId: 'ou-choir-integuza', name: "Integuza", role: 'PRIMARY' },
  { orgId: 'ou-choir-elim', name: "Elim", role: 'SECONDARY' },
  { orgId: 'ou-choir-beulah', name: "Beulah", role: 'SECONDARY' },
  { orgId: 'ou-choir-yerusalemu', name: "Yerusalemu", role: 'SECONDARY' },
  { orgId: 'ou-choir-hope', name: "Hope", role: 'CHILDREN' },
];

const MINISTRIES = [
  { code: 'youth', systemId: 'sys-youth', orgUnitId: 'ou-youth', name: 'Youth', leader: 'p-youth-leader', treasurer: 'p-youth-treas', secretary: 'p-youth-sec', group: 'Youth fellowship' },
] as const;

type Db = PrismaClient;

async function ensure(model: { findUnique: (a: never) => Promise<unknown>; create: (a: never) => Promise<unknown> }, id: string, data: Record<string, unknown>) {
  demoKeep.add(id);
  if (await model.findUnique({ where: { id } } as never)) return false;
  await model.create({ data: { id, ...data } } as never);
  return true;
}

export async function seedSchedulingDemo(db: Db): Promise<{ choirs: number; members: number; roster: number }> {
  const out = { choirs: 0, members: 0, roster: 0 };
  const units = (await db.orgUnit.findMany()) as Array<{ id: string; name: string }>;
  const nameOf = new Map(units.map((u) => [u.id, u.name]));
  const existing = (await db.musicChoir.findMany()) as Array<{ id: string; name: string }>;
  const choirIdOf = new Map<string, string>();
  for (const c of CHOIRS) {
    const name = nameOf.get(c.orgId) ?? c.name;
    const have = existing.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (have) {
      choirIdOf.set(c.orgId, have.id);
      // A choir filed under the old single Choir system moves into its own.
      await db.musicChoir.update({ where: { id: have.id }, data: { systemId: choirSystemId(c.orgId) } } as never);
      continue;
    }
    const id = `demo-choir-${c.orgId}`;
    if (await ensure(db.musicChoir as never, id, { name, role: c.role, systemId: choirSystemId(c.orgId), orgUnitId: nameOf.has(c.orgId) ? c.orgId : null, active: true, createdById: 'p-music-leader' })) out.choirs++;
    choirIdOf.set(c.orgId, id);
  }
  const memberships = (await db.membership.findMany()) as Array<{ id: string; personId: string; type: string; orgUnitId?: string | null; status: string }>;
  const already = new Set(((await db.musicChoirMember.findMany()) as Array<{ choirId: string; personId: string }>).map((m) => `${m.choirId}|${m.personId}`));
  for (const m of memberships.filter((x) => x.type === 'CHOIR_MEMBER' && x.status === 'ACTIVE')) {
    const choirId = m.orgUnitId ? choirIdOf.get(m.orgUnitId) : undefined;
    if (!choirId || already.has(`${choirId}|${m.personId}`)) continue;
    if (await ensure(db.musicChoirMember as never, `demo-cm-${m.id}`, { choirId, personId: m.personId, status: 'ACTIVE', joinedOn: new Date(Date.now() - 400 * DAY) })) out.members++;
  }
  const positions = (await db.position.findMany()) as Array<{ personId: string; title: string; orgUnitId: string }>;
  const officeOf = new Map<string, string>();
  for (const p of positions.filter((x) => x.orgUnitId === 'ou-protocol')) officeOf.set(p.personId, /president/i.test(p.title) ? 'PRESIDENT' : /coordinator/i.test(p.title) ? 'COORDINATOR' : 'MEMBER');
  const rostered = new Set(((await db.protocolRoster.findMany()) as Array<{ personId: string }>).map((r) => r.personId));
  const protocolPeople = new Set([...memberships.filter((x) => x.type === 'PROTOCOL_MEMBER' && x.status === 'ACTIVE').map((x) => x.personId), ...officeOf.keys()]);
  for (const personId of protocolPeople) {
    if (rostered.has(personId)) continue;
    await db.protocolRoster.create({ data: { id: `demo-pr-${personId}`, personId, office: officeOf.get(personId) ?? 'MEMBER', serveDays: 'BOTH', status: 'ACTIVE', unavailableJson: '[]', allowedKindsJson: '[]', onlyServicesJson: '[]' } as never });
    out.roster++;
  }
  return out;
}

export async function seedMoneyWorkDemo(db: Db, now = new Date()): Promise<{ ministries: number; plans: number; entries: number }> {
  const out = { ministries: 0, plans: 0, entries: 0 };
  const year = now.getUTCFullYear();
  const at = (days: number) => new Date(now.getTime() + days * DAY);
  const people = new Set(((await db.person.findMany()) as Array<{ id: string }>).map((p) => p.id));

  for (const m of MINISTRIES) {
    if (!people.has(m.leader) || !people.has(m.treasurer)) continue;
    const k = m.code;
    const sys = m.systemId;
    const base = { orgUnitId: m.orgUnitId, systemId: sys };
    out.ministries++;

    // The account, an approved budget and its lines.
    const accountId = `demo-acc-${k}`;
    await ensure(db.moneyAccount as never, accountId, { ...base, name: `${m.name} main account`, status: 'ACTIVE', createdById: m.treasurer });
    await ensure(db.moneyBudget as never, `demo-bud-${k}-${year}`, { systemId: sys, year, status: 'APPROVED', approvedById: m.leader, approvedAt: at(-90) });
    const lines: Array<['INCOME' | 'SPENDING', string, number]> = [
      ['INCOME', 'DONATION', 1_200_000],
      ['SPENDING', 'EVENT', 900_000], ['SPENDING', 'SUPPLIES', 700_000],
    ];
    for (const [kind, category, planned] of lines) {
      await ensure(db.moneyBudgetLine as never, `demo-bl-${k}-${kind}-${category}`, { systemId: sys, year, kind, category, planned, updatedById: m.treasurer });
    }

    // Programs, events and projects, one in every state a plan can be in.
    const approved = JSON.stringify([{ levelKey: 'UNIT', label: m.name, systemId: sys, status: 'APPROVED', byId: m.leader, at: at(-80).toISOString(), note: null }]);
    const pending = JSON.stringify([{ levelKey: 'UNIT', label: m.name, systemId: sys, status: 'PENDING', byId: null, at: null, note: null }]);
    const team = JSON.stringify([{ personId: m.treasurer, role: 'Treasurer' }, { personId: m.secretary, role: 'Secretary' }]);
    const plan = (suffix: string, title: string, planType: string, status: string, startDays: number, endDays: number, extra: Record<string, unknown> = {}) => ({
      id: `demo-plan-${k}-${suffix}`, ...base, title, aim: `${title}: what we want to achieve and for whom.`, location: 'ADEPR Kacyiru', startsOn: at(startDays), endsOn: at(endDays),
      leaderPersonId: m.leader, teamJson: team, planType, status, approvalsJson: status === 'DRAFT' ? '[]' : status === 'PENDING_APPROVAL' ? pending : approved, createdById: m.leader, ...extra,
    });
    const plans = [
      plan('program', `${m.name} mentoring program`, 'PROGRAM', 'RUNNING', -270, 90, { planningSummary: 'Monthly mentoring sessions for every member.' }),
      plan('event', `${m.name} annual conference`, 'EVENT', 'SETUP', 30, 32),
      plan('project', `${m.name} equipment upgrade`, 'PROJECT', 'ENDED', -120, -30, {
        planningSummary: 'Replace worn equipment before the busy season.', executionSummary: 'Bought and installed everything on time and within budget.', outcome: 'The team now works with reliable equipment.',
        reportComposedById: m.secretary, reportComposedAt: at(-25),
      }),
    ];
    for (const p of plans) {
      if (await ensure(db.workPlan as never, p.id, p)) out.plans++;
    }
    const checks: Array<[string, string, boolean]> = [
      ['program', 'Monthly session held', true],
      ['event', 'Venue booked', true],
      ['project', 'Quotes compared', true],
    ];
    for (const [suffix, label, done] of checks) {
      await ensure(db.workPlanCheck as never, `demo-chk-${k}-${suffix}-${label.length}`, { planId: `demo-plan-${k}-${suffix}`, label, done, doneById: done ? m.secretary : null, doneAt: done ? at(-40) : null });
    }
    await ensure(db.workPlanNote as never, `demo-note-${k}-program`, { planId: `demo-plan-${k}-program`, authorId: m.leader, text: 'Sessions run on the first Saturday of every month.' });

    // The annual money plan: activities with a cost, each tied to its program, event or project.
    const items: Array<[string, string, number, string | null, string, string | null, string]> = [
      ['mat', 'Mentoring materials', 240_000, monthKey(at(-60)), 'SUPPLIES', 'program', 'PLANNED'],
      ['venue', 'Conference venue and sound', 500_000, monthKey(at(30)), 'EVENT', 'event', 'PLANNED'],
      ['mic', 'Microphones and mixer', 450_000, monthKey(at(-90)), 'SUPPLIES', 'project', 'DONE'],
    ];
    for (const [id, title, amount, dueMonth, category, suffix, status] of items) {
      await ensure(db.moneyPlanItem as never, `demo-mpi-${k}-${id}`, { systemId: sys, year, title, amount, dueMonth, category, status, createdById: m.treasurer, planId: suffix ? `demo-plan-${k}-${suffix}` : null });
    }

    // What actually happened: income every month, spending against the plans, one still waiting.
    const entry = (id: string, kind: 'INCOME' | 'SPENDING', amount: number, daysAgo: number, category: string, note: string, status: string, suffix: string | null) => ({
      id: `demo-me-${k}-${id}`, accountId, ...base, kind, amount, occurredOn: at(-daysAgo), category, note, status, recordedById: m.treasurer, recordedAt: at(-daysAgo),
      decidedById: status === 'APPROVED' ? m.leader : null, decidedAt: status === 'APPROVED' ? at(-daysAgo + 1) : null, planId: suffix ? `demo-plan-${k}-${suffix}` : null,
    });
    const rows = [
      entry('inc0', 'INCOME', 180_000, 5, 'DONATION', 'Members and friends gave toward the ministry', 'RECORDED', null),
      entry('s-mic', 'SPENDING', 420_000, 80, 'SUPPLIES', 'Microphones and mixer', 'APPROVED', 'project'),
      entry('s-venue', 'SPENDING', 150_000, 3, 'EVENT', 'Deposit for the conference venue', 'PENDING_APPROVAL', 'event'),
    ];
    for (const r of rows) {
      if (await ensure(db.moneyEntry as never, r.id, r)) out.entries++;
    }

    // Report schedules, so "due" and "late" show up for the president and for Central Administration.
    for (const [kind, dueDay] of [['MONEY', 5], ['WORK_PLANS', 10]] as const) {
      await ensure(db.reportSchedule as never, `demo-rs-${k}-${kind}`, { ...base, kind, dueDay, active: true, createdById: m.leader });
    }

    // A fellowship that meets, so attendance shows on the dashboard.
    if (m.group) {
      const groupId = `demo-grp-${k}`;
      await ensure(db.unitGroup as never, groupId, { ...base, kind: 'FELLOWSHIP', name: m.group, leaderPersonId: m.leader, meetsOn: 'Saturday', status: 'ACTIVE', createdById: m.leader });
      const present = [m.leader, m.treasurer, m.secretary];
      for (let i = 0; i < 3; i++) {
        const when = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 8));
        const here = JSON.stringify(present.slice(0, Math.max(1, 3 - (i % 3 === 2 ? 1 : 0))).concat(i < 3 ? ['p-patrick'].filter((x) => people.has(x)) : []));
        await ensure(db.groupSession as never, `demo-gs-${k}-${i}`, { groupId, heldOn: when, presentJson: here, recordedById: m.secretary });
      }
    }
  }
  return out;
}

export async function seedDemoFlows(db: Db) {
  const scheduling = await seedSchedulingDemo(db);
  const money = await seedMoneyWorkDemo(db);
  const content = await seedDemoContent(db);
  await pruneOldDemo(db);
  return { scheduling, money, content };
}

/** Models with demo rows, children before parents, so removing a parent never meets a child. */
const PRUNE = [
  'workPlanCheck', 'workPlanNote', 'moneyEntry', 'moneyPlanItem', 'groupSession', 'groupMember', 'contributionLine', 'decision', 'scheduleSlot',
  'personRecord', 'personDeed', 'donation', 'workPlan', 'unitGroup', 'contributionList', 'meeting', 'monthPlan', 'letter', 'report', 'reportSchedule',
  'moneyBudgetLine', 'moneyBudget', 'workTask', 'serviceCollection', 'couplePair', 'visitLog', 'evangelismContact', 'moneyAccount',
] as const;

/** Older runs made several demo rows per screen. Only one example per screen is kept; the rest (ids starting `demo-`) go. */
export async function pruneOldDemo(db: Db): Promise<number> {
  let removed = 0;
  for (const name of PRUNE) {
    const model = (db as unknown as Record<string, { findMany: (a?: unknown) => Promise<Array<{ id: string }>>; delete: (a: unknown) => Promise<unknown> }>)[name];
    if (!model) continue;
    try {
      const rows = await model.findMany({ select: { id: true } });
      for (const r of rows) {
        if (!r.id.startsWith('demo-') || demoKeep.has(r.id)) continue;
        try { await model.delete({ where: { id: r.id } }); removed++; } catch { /* still in use by something else: leave it */ }
      }
    } catch { /* model not present in this database */ }
  }
  return removed;
}
