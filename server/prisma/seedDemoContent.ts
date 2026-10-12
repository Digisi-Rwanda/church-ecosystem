/**
 * Demo content so no page of the church looks empty: two full member profiles (with good deeds and
 * giving), groups, couples, visits, contacts, tasks, programs, events and projects, reports, meetings,
 * decisions, letters, service collections and the month's schedule. Runs only where demo accounts are
 * seeded (never on a live deployment). Every row has a fixed id, so running it again changes nothing,
 * and anything the church already has is left alone.
 */
import type { PrismaClient } from '@prisma/client';

const DAY = 24 * 3600 * 1000;
type Db = PrismaClient;
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function ensure(model: { findUnique: (a: never) => Promise<unknown>; create: (a: never) => Promise<unknown> }, id: string, data: Record<string, unknown>): Promise<boolean> {
  if (await model.findUnique({ where: { id } } as never)) return false;
  await model.create({ data: { id, ...data } } as never);
  return true;
}

/** The units that get demo content: system, org unit, short name. */
const UNITS = [
  { code: 'main', systemId: 'sys-main', orgUnitId: 'ou-church', name: 'ADEPR Kacyiru' },
  { code: 'youth', systemId: 'sys-youth', orgUnitId: 'ou-youth', name: 'Youth' },
  { code: 'children', systemId: 'sys-children', orgUnitId: 'ou-children', name: 'Children' },
  { code: 'men', systemId: 'sys-men', orgUnitId: 'ou-men', name: 'Men' },
  { code: 'women', systemId: 'sys-women', orgUnitId: 'ou-women', name: 'Women' },
  { code: 'couples', systemId: 'sys-couples', orgUnitId: 'ou-couples', name: 'Couples' },
  { code: 'elderly', systemId: 'sys-elderly', orgUnitId: 'ou-elderly', name: 'Elderly' },
] as const;

export async function seedDemoContent(db: Db, now = new Date()): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const bump = (k: string, made: boolean) => { if (made) out[k] = (out[k] ?? 0) + 1; };
  const at = (days: number) => new Date(now.getTime() + days * DAY);
  const people = new Set(((await db.person.findMany()) as Array<{ id: string }>).map((p) => p.id));
  const orgs = new Set(((await db.orgUnit.findMany()) as Array<{ id: string }>).map((o) => o.id));
  const positions = (await db.position.findMany()) as Array<{ personId: string; systemId?: string | null; orgUnitId?: string | null; ministryOffice?: string | null }>;
  const who = (u: (typeof UNITS)[number], office: string, fallback: string): string => {
    const hit = positions.find((p) => (p.systemId === u.systemId || p.orgUnitId === u.orgUnitId) && p.ministryOffice === office && people.has(p.personId));
    return hit?.personId ?? fallback;
  };
  const pastor = people.has('p-pastor') ? 'p-pastor' : [...people][0] ?? '';
  const secretary = people.has('p-secretary') ? 'p-secretary' : pastor;
  if (!pastor) return out;

  // ── Two full member profiles: facts, records, good deeds and giving ──────────────────────
  const profiles = [
    {
      id: 'p-member', sys: 'sys-youth', org: 'ou-youth', gender: 'MALE', dob: '1990-04-12', address: 'KG 11 Ave, Kacyiru, Kigali', joined: '2012-03-04', nid: '1199080012345678',
      records: [
        ['EDUCATION', { level: 'BACHELOR', field: 'Computer Science', school: 'University of Rwanda', startYear: 2009, endYear: 2013 }],
        ['EMPLOYMENT', { status: 'EMPLOYED', employer: 'Kigali Software Ltd', role: 'Software engineer', since: '2014-02-01' }],
        ['SKILL', { name: 'Sound and projection', level: 'GOOD' }], ['SKILL', { name: 'Teaching', level: 'GOOD' }],
        ['GIFT', { name: 'Hospitality', note: 'Welcomes visitors every Sunday' }],
        ['CALLING', { name: 'Sunday school teacher', note: 'Teaches the young adults class' }],
        ['BAPTISM', { date: '2012-06-17', place: 'ADEPR Kacyiru', baptisedBy: 'Rev. Jean Bosco Habimana' }],
        ['MARRIAGE', { date: '2018-08-18', spouseName: 'Diane Uwase', place: 'ADEPR Kacyiru', blessedBy: 'Rev. Jean Bosco Habimana', certificateRef: 'MC-2018-044' }],
        ['FAMILY', { relation: 'SPOUSE', name: 'Diane Uwase' }], ['FAMILY', { relation: 'CHILD', name: 'Emmanuel Niyonzima' }],
        ['CONTACT', { label: 'WhatsApp', value: '+250788123456' }],
      ],
      deeds: [['Paid the school fees of an orphan in the youth fellowship', -200], ['Led the clean-up of the church compound', -120], ['Visited and prayed with three sick members', -45]],
      gifts: [['UNIT', 'sys-youth', 'Umusanzu', 25_000], ['UNIT', 'sys-youth', 'Umusanzu', 25_000], ['UNIT', 'sys-youth', 'Umusanzu', 30_000]],
      donations: [['Building fund', 150_000, -70], ['Harvest thanksgiving', 80_000, -20]],
    },
    {
      id: 'p-youth-leader', sys: 'sys-youth', org: 'ou-youth', gender: 'FEMALE', dob: '1993-09-23', address: 'KK 15 Rd, Gikondo, Kigali', joined: '2010-01-10', nid: '1199370023456789',
      records: [
        ['EDUCATION', { level: 'MASTER', field: 'Social Work', school: 'Mount Kenya University', startYear: 2016, endYear: 2018 }],
        ['EMPLOYMENT', { status: 'EMPLOYED', employer: 'Hope Rwanda NGO', role: 'Programme officer', since: '2019-05-01' }],
        ['SKILL', { name: 'Public speaking', level: 'EXPERT' }], ['SKILL', { name: 'Event planning', level: 'GOOD' }],
        ['GIFT', { name: 'Leadership', note: 'Gathers and encourages young people' }],
        ['CALLING', { name: 'President of the Youth Ministry', note: 'Leads about 120 young people' }], ['CALLING', { name: 'Women in prayer coordinator', note: '' }],
        ['BAPTISM', { date: '2010-04-04', place: 'ADEPR Kacyiru', baptisedBy: 'Rev. Claire Mukamana' }],
        ['FAMILY', { relation: 'PARENT', name: 'Mama Immaculée Ingabire' }], ['FAMILY', { relation: 'SIBLING', name: 'Kevin Ingabire' }],
        ['CONTACT', { label: 'WhatsApp', value: '+250788654321' }],
      ],
      deeds: [['Organised a free medical camp for 200 neighbours', -160], ['Mentored 12 teenagers through exam season', -90], ['Raised funds for a widow\'s house repair', -30]],
      gifts: [['UNIT', 'sys-youth', 'Umusanzu', 40_000], ['UNIT', 'sys-youth', 'Umusanzu', 40_000]],
      donations: [['Youth conference', 200_000, -50], ['Outreach day', 60_000, -15]],
    },
    {
      id: 'p-music-treas', sys: 'sys-music', org: 'ou-music', gender: 'FEMALE', dob: '1991-11-11', address: 'KN 5 St, Remera, Kigali', joined: '2022-11-11', nid: '1199170034567890',
      records: [
        ['EDUCATION', { level: 'BACHELOR', field: 'Accounting and Finance', school: 'University of Kigali', startYear: 2010, endYear: 2014 }],
        ['EMPLOYMENT', { status: 'EMPLOYED', employer: 'Bank of Kigali', role: 'Accountant', since: '2015-03-02' }],
        ['SKILL', { name: 'Bookkeeping', level: 'EXPERT' }], ['SKILL', { name: 'Choir singing (alto)', level: 'GOOD' }],
        ['GIFT', { name: 'Singing', note: 'Leads the alto section' }], ['GIFT', { name: 'Stewardship', note: 'Keeps the ministry accounts clean' }],
        ['CALLING', { name: 'Treasurer of the Music Ministry', note: 'Keeps the books and reports every month' }], ['CALLING', { name: 'Alto section leader', note: 'Choir of the first service' }],
        ['BAPTISM', { date: '2022-12-18', place: 'ADEPR Kacyiru', baptisedBy: 'Rev. Jean Bosco Habimana' }],
        ['MARRIAGE', { date: '2019-07-06', spouseName: 'Jean Claude Mugabo', place: 'ADEPR Remera', blessedBy: 'Rev. Claire Mukamana', certificateRef: 'MC-2019-031' }],
        ['FAMILY', { relation: 'SPOUSE', name: 'Jean Claude Mugabo' }], ['FAMILY', { relation: 'CHILD', name: 'Grace Mugabo' }], ['FAMILY', { relation: 'PARENT', name: 'Mama Esther Umuhoza' }],
        ['CONTACT', { label: 'WhatsApp', value: '+250788777111' }],
      ],
      deeds: [['Kept the choir accounts open and shared them with the whole team', -180], ['Paid for the transport of the choir to the Huye concert', -100], ['Sang at the funeral of a member and comforted the family', -35]],
      gifts: [['UNIT', 'sys-music', 'Umusanzu', 30_000], ['UNIT', 'sys-music', 'Umusanzu', 30_000], ['UNIT', 'sys-music', 'Umusanzu', 35_000]],
      donations: [['Choir instruments fund', 120_000, -80], ['Christmas concert', 90_000, -25]],
    },
    {
      id: 'p-men-vp', sys: 'sys-men', org: 'ou-men', gender: 'MALE', dob: '1985-02-28', address: 'KG 622 St, Kicukiro, Kigali', joined: '2009-05-17', nid: '1198580045678901',
      records: [
        ['EDUCATION', { level: 'ASSOCIATE', field: 'Civil Engineering', school: 'IPRC Kigali', startYear: 2005, endYear: 2008 }],
        ['EMPLOYMENT', { status: 'SELF_EMPLOYED', business: 'Habimana Construction', since: '2012-01-15' }],
        ['SKILL', { name: 'Building and repairs', level: 'EXPERT' }], ['SKILL', { name: 'Mentoring men', level: 'GOOD' }],
        ['GIFT', { name: 'Service', note: 'First to volunteer for church works' }], ['GIFT', { name: 'Encouragement', note: '' }],
        ['CALLING', { name: 'Vice President of the Men Ministry', note: 'Coordinates the men\'s breakfast and works days' }], ['CALLING', { name: 'Church building committee member', note: '' }],
        ['BAPTISM', { date: '2009-08-09', place: 'ADEPR Kacyiru', baptisedBy: 'Rev. Jean Bosco Habimana' }],
        ['MARRIAGE', { date: '2013-12-21', spouseName: 'Solange Mukamana', place: 'ADEPR Kacyiru', blessedBy: 'Rev. Jean Bosco Habimana', certificateRef: 'MC-2013-102' }],
        ['FAMILY', { relation: 'SPOUSE', name: 'Solange Mukamana' }], ['FAMILY', { relation: 'CHILD', name: 'Ethan Habimana' }], ['FAMILY', { relation: 'CHILD', name: 'Ruth Habimana' }],
        ['CONTACT', { label: 'WhatsApp', value: '+250788999222' }],
      ],
      deeds: [['Rebuilt the roof of the Sunday school room at no cost', -210], ['Hosted the men\'s prayer breakfast for 40 men', -75], ['Helped a young family move into their new home', -28]],
      gifts: [['UNIT', 'sys-men', 'Umusanzu', 50_000], ['UNIT', 'sys-men', 'Umusanzu', 50_000], ['UNIT', 'sys-men', 'Umusanzu', 50_000]],
      donations: [['Building fund', 300_000, -90], ['Harvest thanksgiving', 150_000, -18]],
    },
  ] as const;
  for (const pr of profiles) {
    if (!people.has(pr.id)) continue;
    const row = (await db.person.findUnique({ where: { id: pr.id } })) as { gender?: string | null; dateOfBirth?: string | null; address?: string | null; nationalId?: string | null; joinedChurchOn?: string | null } | null;
    if (row) {
      const patch: Record<string, string> = {};
      if (!row.gender) patch.gender = pr.gender;
      if (!row.dateOfBirth) patch.dateOfBirth = pr.dob;
      if (!row.address) patch.address = pr.address;
      if (!row.nationalId) patch.nationalId = pr.nid;
      if (!row.joinedChurchOn) patch.joinedChurchOn = pr.joined;
      if (Object.keys(patch).length) await db.person.update({ where: { id: pr.id }, data: patch as never });
    }
    let n = 0;
    for (const [section, data] of pr.records) bump('profile records', await ensure(db.personRecord as never, `demo-rec-${pr.id}-${n++}`, { personId: pr.id, section, dataJson: JSON.stringify(data), status: 'CURRENT', recordedById: secretary, recordedAt: at(-300 + n * 7) }));
    n = 0;
    for (const [note, days] of pr.deeds) bump('good deeds', await ensure(db.personDeed as never, `demo-deed-${pr.id}-${n++}`, { personId: pr.id, note, day: ymd(at(days)), recordedById: pastor, unitId: 'sys-main' }));
    n = 0;
    for (const [level, systemId, typeName, amount] of pr.gifts) {
      const month = monthKey(at(-30 * (n + 1)));
      const listId = `demo-cl-${pr.id}-${n}`;
      bump('contribution lists', await ensure(db.contributionList as never, listId, { systemId, level, typeCode: 'UMUSANZU', typeName, month, status: 'APPROVED', createdById: pastor, submittedAt: at(-30 * (n + 1)), decidedById: pastor, decidedAt: at(-30 * (n + 1) + 2) }));
      const person = (await db.person.findUnique({ where: { id: pr.id } })) as { fullName: string };
      bump('contribution lines', await ensure(db.contributionLine as never, `demo-cln-${pr.id}-${n}`, { listId, name: person.fullName, personId: pr.id, amount }));
      n++;
    }
    n = 0;
    const account = `demo-acc-${pr.sys.replace('sys-', '')}`;
    await ensure(db.moneyAccount as never, account, { orgUnitId: pr.org, systemId: pr.sys, name: 'Main account', status: 'ACTIVE', createdById: pastor });
    {
      const person = (await db.person.findUnique({ where: { id: pr.id } })) as { fullName: string };
      for (const [typeName, amount, days] of pr.donations) bump('donations', await ensure(db.donation as never, `demo-don-${pr.id}-${n++}`, { systemId: pr.sys, accountId: account, donorName: person.fullName, donorPersonId: pr.id, amount, receivedOn: at(days), note: typeName, status: 'APPROVED', recordedById: pastor, decidedById: pastor, decidedAt: at(days + 1), typeCode: 'GIFT', typeName }));
    }
  }

  // ── Groups, couples, visits and contacts ─────────────────────────────────────────────────
  for (const u of UNITS.filter((x) => x.code !== 'main')) {
    if (!orgs.has(u.orgUnitId)) continue;
    const leader = who(u, 'PRESIDENT', pastor);
    const sec = who(u, 'SECRETARY', secretary);
    const gs = [{ k: 'a', kind: 'FELLOWSHIP', name: `${u.name} fellowship`, meets: 'Saturday' }, { k: 'b', kind: 'PRAYER', name: `${u.name} prayer cell`, meets: 'Wednesday' }];
    for (const g of gs) {
      const id = `demo-ug-${u.code}-${g.k}`;
      bump('groups', await ensure(db.unitGroup as never, id, { orgUnitId: u.orgUnitId, systemId: u.systemId, kind: g.kind, name: g.name, leaderPersonId: leader, meetsOn: g.meets, status: 'ACTIVE', createdById: leader }));
      for (const [i, pid] of [leader, sec, ...positions.filter((p) => p.systemId === u.systemId).map((p) => p.personId)].filter((x, i, a) => people.has(x) && a.indexOf(x) === i).slice(0, 5).entries()) {
        bump('group members', await ensure(db.groupMember as never, `demo-gm-${u.code}-${g.k}-${i}`, { groupId: id, personId: pid, joinedOn: at(-200), status: 'ACTIVE' }));
      }
    }
  }
  const couples: Array<[string, string, string]> = [['p-choir-treas', 'p-choir-vp', '2015-06-20'], ['p-deacon-vp', 'p-deacon-sec', '2012-12-15'], ['p-worship-treas', 'p-worship-vp', '2019-09-07']];
  for (const [i, [a, b, on]] of couples.entries()) {
    if (people.has(a) && people.has(b)) bump('couples', await ensure(db.couplePair as never, `demo-couple-${i}`, { systemId: 'sys-couples', personAId: a, personBId: b, marriedOn: new Date(on), status: 'ACTIVE', createdById: pastor }));
  }
  const elders = ['p-pastor-2', 'p-deacon-coord', 'p-catechist'].filter((x) => people.has(x));
  const visits: Array<[string, string, number]> = [['Visited a member recovering at home and prayed with the family.', 'a', -12], ['Brought food and encouragement to an elderly widow.', 'b', -25], ['Followed up with a family that missed three services.', 'c', -40]];
  for (const [i, [note, , days]] of visits.entries()) {
    const elder = elders[i % Math.max(elders.length, 1)];
    if (elder) bump('visits', await ensure(db.visitLog as never, `demo-visit-${i}`, { systemId: 'sys-main', elderPersonId: elder, visitedOn: at(days), visitorsJson: JSON.stringify([elder, secretary].filter((x, j, a) => a.indexOf(x) === j)), note, recordedById: elder }));
  }
  const contacts: Array<[string, string, string, string]> = [['Alphonse Hakizimana', '+250788111222', 'Met at the market outreach', 'NEW'], ['Beatrice Mukamana', '+250788333444', 'Invited by a neighbour who is a member', 'FOLLOWING_UP'], ['Claude Ndayisaba', '+250788555666', 'Came to the youth concert', 'NEW']];
  for (const [i, [fullName, phone, howMet, status]] of contacts.entries()) {
    bump('contacts', await ensure(db.evangelismContact as never, `demo-contact-${i}`, { fullName, phone, howMet, metOn: at(-10 - i * 6), assignedToId: people.has('p-pastor-2') ? 'p-pastor-2' : pastor, status, note: null, createdById: pastor }));
  }

  // ── Work: tasks, programs, events and projects for the units that have none ──────────────
  for (const u of UNITS) {
    if (!orgs.has(u.orgUnitId)) continue;
    const leader = u.code === 'main' ? pastor : who(u, 'PRESIDENT', pastor);
    const treas = u.code === 'main' ? (people.has('p-church-treas') ? 'p-church-treas' : pastor) : who(u, 'TREASURER', leader);
    const base = { orgUnitId: u.orgUnitId, systemId: u.systemId };
    const approved = JSON.stringify([{ levelKey: 'UNIT', label: u.name, systemId: u.systemId, status: 'APPROVED', byId: leader, at: at(-60).toISOString(), note: null }]);
    const tasks: Array<[string, string, string, number]> = [[`Prepare the ${u.name} monthly report`, 'IN_PROGRESS', leader, 6], [`Update the ${u.name} members list`, 'TODO', sec(u, secretary, who), 14], [`Thank the volunteers of ${u.name}`, 'DONE', treas, -5]];
    for (const [i, [title, status, owner, due]] of tasks.entries()) {
      bump('tasks', await ensure(db.workTask as never, `demo-task-${u.code}-${i}`, { title, description: 'Demo task.', ownerPersonId: owner, createdByPersonId: leader, contextType: 'GENERAL', systemId: u.systemId, orgUnitId: u.orgUnitId, visibility: 'MINISTRY', status, dueDate: at(due), startDate: at(-20) }));
    }
    const plan = (suffix: string, title: string, planType: string, status: string, a: number, b: number) => ({
      id: `demo-plan-${u.code}-${suffix}`, ...base, title, aim: `${title}: what we want to achieve and for whom.`, location: 'ADEPR Kacyiru', startsOn: at(a), endsOn: at(b),
      leaderPersonId: leader, teamJson: JSON.stringify([{ personId: treas, role: 'Treasurer' }]), planType, status, approvalsJson: status === 'DRAFT' ? '[]' : approved, createdById: leader,
    });
    const plans = [
      plan('p1', `${u.name} weekly teaching`, 'PROGRAM', 'RUNNING', -150, 120), plan('p2', `${u.name} mentoring circle`, 'PROGRAM', 'RUNNING', -90, 200),
      plan('e1', `${u.name} fellowship day`, 'EVENT', 'SETUP', 12, 12), plan('e2', `${u.name} thanksgiving evening`, 'EVENT', 'SETUP', 26, 26),
      plan('j1', `${u.name} hall renovation`, 'PROJECT', 'RUNNING', -40, 60), plan('j2', `${u.name} welfare fund drive`, 'PROJECT', 'DRAFT', 40, 100),
    ];
    for (const p of plans) bump('plans', await ensure(db.workPlan as never, p.id, p));
  }

  // ── Reports ───────────────────────────────────────────────────────────────────────────────
  const lastMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const prevMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)));
  for (const u of UNITS) {
    if (!orgs.has(u.orgUnitId)) continue;
    const author = u.code === 'main' ? secretary : who(u, 'SECRETARY', secretary);
    const kinds: Array<[string, string, string, string]> = [['MEETINGS', lastMonth, 'PUBLISHED', 'Meetings'], ['ATTENDANCE', lastMonth, 'PUBLISHED', 'Attendance'], ['WORK_PLANS', prevMonth, 'PUBLISHED', 'Work plans']];
    for (const [kind, periodKey, status, label] of kinds) {
      bump('reports', await ensure(db.report as never, `demo-rep-${u.code}-${kind}`, { systemId: u.systemId, orgUnitId: u.orgUnitId, kind, periodKey, title: `${u.name} · ${label} · ${periodKey}`, status, snapshotJson: '{}', composedById: author, composedAt: at(-20), publishedById: author, publishedAt: at(-19) }));
    }
  }

  // ── Governance: meetings, decisions, letters and the Sunday collections ──────────────────
  for (const u of UNITS.filter((x) => ['main', 'youth', 'children'].includes(x.code))) {
    if (!orgs.has(u.orgUnitId)) continue;
    const leader = u.code === 'main' ? pastor : who(u, 'PRESIDENT', pastor);
    const base = { orgUnitId: u.orgUnitId, systemId: u.systemId };
    const meetings: Array<[string, string, string, number, string, string | null]> = [
      ['m1', 'BOARD', `${u.name} board meeting`, -21, 'HELD', 'Reviewed the quarter, approved the budget plan and agreed the next steps.'],
      ['m2', 'PLANNING', `${u.name} planning meeting`, 5, 'PLANNED', null], ['m3', 'COMMITTEE', `${u.name} committee meeting`, 19, 'PLANNED', null],
    ];
    for (const [k, typeCode, title, days, status, minutes] of meetings) {
      bump('meetings', await ensure(db.meeting as never, `demo-meet-${u.code}-${k}`, { ...base, typeCode, title, scheduledAt: at(days), location: 'Church hall', agenda: 'Opening prayer, reports, plans, any other business.', minutes, attendeesJson: JSON.stringify([leader]), status, createdById: leader, heldAt: status === 'HELD' ? at(days) : null, heldById: status === 'HELD' ? leader : null }));
    }
    const decisions: Array<[string, string, string, string]> = [['d1', 'Approve the annual calendar', 'APPROVED', 'The calendar of activities for the year is approved.'], ['d2', 'Buy new chairs for the hall', 'DRAFT', 'Quotes are being collected.'], ['d3', 'Start a welfare fund', 'APPROVED', 'Members give monthly to support families in need.']];
    for (const [k, title, status, detail] of decisions) {
      bump('decisions', await ensure(db.decision as never, `demo-dec-${u.code}-${k}`, { meetingId: `demo-meet-${u.code}-m1`, ...base, title, detail, status, createdById: leader, decidedAt: status === 'APPROVED' ? at(-20) : null, decidedById: status === 'APPROVED' ? leader : null, ownerPersonId: leader, dueDate: at(30) }));
    }
    const letters: Array<[string, string, string, string, string]> = [['l1', 'INTRODUCTION', 'Introduction of a member', 'Pastor of the receiving church', 'DELIVERED'], ['l2', 'REQUEST', 'Request to use the hall', 'The Sector Office', 'DRAFT'], ['l3', 'THANKS', 'Thank you for your support', 'Friends of the church', 'PRINTED']];
    for (const [k, typeCode, subject, recipientName, status] of letters) {
      bump('letters', await ensure(db.letter as never, `demo-let-${u.code}-${k}`, { reference: `DEMO-${u.code.toUpperCase()}-${k.toUpperCase()}`, ...base, typeCode, subject, body: 'Dear Sir or Madam,\n\nThis letter is part of the demo data.\n\nIn Christ,', recipientName, status, createdById: leader, printedAt: status !== 'DRAFT' ? at(-8) : null, printedById: status !== 'DRAFT' ? leader : null, deliveredAt: status === 'DELIVERED' ? at(-6) : null, deliveredById: status === 'DELIVERED' ? leader : null, deliveryMethod: status === 'DELIVERED' ? 'HAND' : null }));
    }
  }
  const sundays = [-7, -14, -21, -28];
  for (const [i, d] of sundays.entries()) {
    bump('collections', await ensure(db.serviceCollection as never, `demo-coll-${i}`, { systemId: 'sys-main', kind: 'SERVICE', title: `Sunday service ${ymd(at(d))}`, heldOn: at(d), startsAt: '09:00', tithe: 420_000 + i * 15_000, offering: 260_000 + i * 10_000, other: 40_000, status: 'ACTIVE', recordedById: people.has('p-church-treas') ? 'p-church-treas' : pastor }));
  }

  // ── Schedule: the month's plan with its slots, for the church and for two ministries ─────
  const thisMonth = monthKey(now);
  for (const u of UNITS.filter((x) => ['main', 'youth', 'children'].includes(x.code))) {
    if (!orgs.has(u.orgUnitId)) continue;
    const leader = u.code === 'main' ? pastor : who(u, 'PRESIDENT', pastor);
    const planId = `demo-mp-${u.code}`;
    bump('month plans', await ensure(db.monthPlan as never, planId, { orgUnitId: u.orgUnitId, systemId: u.systemId, month: thisMonth, status: 'PUBLISHED', createdById: leader, confirmedById: leader, confirmedAt: at(-5), publishedById: leader, publishedAt: at(-4) }));
    const slots: Array<[string, string, string, number, number, boolean]> = [
      ['s1', 'Sunday worship service', 'SERVICE', 3, 9, true], ['s2', `${u.name} rehearsal`, 'REHEARSAL', 6, 17, false], ['s3', `${u.name} committee`, 'MEETING', 10, 15, false],
      ['s4', 'Sunday worship service', 'SERVICE', 10, 9, true], ['s5', `${u.name} fellowship`, 'OTHER', 13, 14, false],
    ];
    for (const [k, title, kind, d, hour, churchWide] of slots) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d, hour - 2, 0));
      bump('slots', await ensure(db.scheduleSlot as never, `demo-slot-${u.code}-${k}`, { planId, orgUnitId: u.orgUnitId, systemId: u.systemId, title, kind, startsAt: start, endsAt: new Date(start.getTime() + 2 * 3600 * 1000), location: 'Main church hall', notes: null, churchWide: churchWide && u.code === 'main', createdById: leader }));
    }
  }
  return out;
}

function sec(u: (typeof UNITS)[number], fallback: string, who: (u: (typeof UNITS)[number], office: string, fallback: string) => string): string {
  return u.code === 'main' ? fallback : who(u, 'SECRETARY', fallback);
}
