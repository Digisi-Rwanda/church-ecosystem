import 'dotenv/config';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { backfillCodes } from '../src/lib/codes.js';
import { backfillStructure } from '../src/lib/offices.js';
import { seedDemoFlows } from './seedDemoFlows.js';
import { MINISTRY_KIT_ORGS, SPECIAL_MINISTRY_ORGS, CHOIR_ORGS, CHOIR_PARENT_ORG, choirSystemId } from '../src/lib/ministryOrgs.js';

const prisma = new PrismaClient();

const SYSTEMS = [
  {
    id: 'sys-main',
    code: 'MAIN_CHURCH',
    name: 'ADEPR Kacyiru — Central Administration',
    shortName: 'Central Administration',
    kind: 'MAIN',
    basePath: '/',
    description: 'Church leadership: governance, oversight, reports received, collections, pulpit and settings',
  },
  {
    id: 'sys-choir',
    code: 'CHOIR',
    name: 'Choir System',
    shortName: 'Choir',
    kind: 'MINISTRY',
    basePath: '/systems/choir',
    description: 'The Choir Ministry: umbrella over the choirs, each of which is a system of its own',
  },
  {
    id: 'sys-worship',
    code: 'WORSHIP',
    name: 'Worship System',
    shortName: 'Worship',
    kind: 'MINISTRY',
    basePath: '/systems/worship',
    description: 'Worship team music and finance',
  },
  {
    id: 'sys-youth',
    code: 'YOUTH',
    name: 'Youth System',
    shortName: 'Youth',
    kind: 'MINISTRY',
    basePath: '/systems/youth',
    description: 'Youth programs, events, finance kit',
  },
  {
    id: 'sys-deacon',
    code: 'DEACON',
    name: 'Deacon Ministry',
    shortName: 'Deacon',
    kind: 'MINISTRY',
    basePath: '/systems/deacon',
    description: 'Care cases and benevolence',
  },
  {
    id: 'sys-protocol',
    code: 'PROTOCOL',
    name: 'Protocol Team',
    shortName: 'Protocol',
    kind: 'MINISTRY',
    basePath: '/systems/protocol',
    description: 'Service staffing and schedule',
  },
  {
    id: 'sys-music',
    code: 'MUSIC',
    name: 'Music System',
    shortName: 'Music',
    kind: 'MINISTRY',
    basePath: '/systems/music',
    description: 'Music oversight peer kit',
  },
  {
    id: 'sys-media',
    code: 'MEDIA',
    name: 'Media Team',
    shortName: 'Media',
    kind: 'MINISTRY',
    basePath: '/systems/media',
    description: 'Media peer kit',
  },
  {
    id: 'sys-men',
    code: 'MEN',
    name: 'Men System',
    shortName: 'Men',
    kind: 'MINISTRY',
    basePath: '/systems/men',
    description: 'Men fellowship peer kit',
  },
  {
    id: 'sys-women',
    code: 'WOMEN',
    name: 'Women System',
    shortName: 'Women',
    kind: 'MINISTRY',
    basePath: '/systems/women',
    description: 'Women fellowship peer kit',
  },
  {
    id: 'sys-couples',
    code: 'COUPLES',
    name: 'Family Ministry',
    shortName: 'Family',
    kind: 'MINISTRY',
    basePath: '/systems/couples',
    description: 'Family ministry peer kit',
  },
  {
    id: 'sys-children',
    code: 'CHILDREN',
    name: 'Children System',
    shortName: 'Children',
    kind: 'MINISTRY',
    basePath: '/systems/children',
    description: 'Children / Sunday School peer kit',
  },
  {
    id: 'sys-elderly',
    code: 'ELDERLY',
    name: 'Elderly System',
    shortName: 'Elderly',
    kind: 'MINISTRY',
    basePath: '/systems/elderly',
    description: 'Elderly care peer kit',
  },
  {
    id: 'sys-evangelism',
    code: 'EVANGELISM',
    name: 'Evangelism System',
    shortName: 'Evangelism',
    kind: 'MINISTRY',
    basePath: '/systems/evangelism',
    description: 'Outreach peer kit',
  },
  {
    id: 'sys-intercessors',
    code: 'INTERCESSORS',
    name: 'Intercessors System',
    shortName: 'Intercessors',
    kind: 'MINISTRY',
    basePath: '/systems/intercessors',
    description: 'Prayer peer kit',
  },
  {
    id: 'sys-finance',
    code: 'FINANCE',
    name: 'Finance (shared module)',
    shortName: 'Finance',
    kind: 'SHARED',
    basePath: '/finance',
    description:
      'Church treasury module (Module 5) — used inside Main and ministries',
  },
] as const;

async function main() {
  for (const s of SYSTEMS) {
    await prisma.churchSystem.upsert({
      where: { id: s.id },
      create: { ...s, status: 'ACTIVE' },
      update: {
        name: s.name,
        shortName: s.shortName,
        kind: s.kind,
        basePath: s.basePath,
        description: s.description,
      },
    });
  }

  const ouChurch = await prisma.orgUnit.upsert({
    where: { id: 'ou-church' },
    create: {
      id: 'ou-church',
      name: 'ADEPR Kacyiru',
      type: 'ORGANISATION',
    },
    update: { name: 'ADEPR Kacyiru' },
  });

  const ouFinance = await prisma.orgUnit.upsert({
    where: { id: 'ou-finance' },
    create: {
      id: 'ou-finance',
      name: 'Finance Office',
      type: 'OFFICE',
      parentId: ouChurch.id,
      systemId: 'sys-finance',
    },
    update: { name: 'Finance Office' },
  });

  await prisma.churchSystem.update({
    where: { id: 'sys-finance' },
    data: { orgUnitId: ouFinance.id },
  });

  const pastor = await prisma.person.upsert({
    where: { id: 'p-pastor' },
    create: {
      id: 'p-pastor',
      fullName: 'Pastor Bootstrap',
      preferredName: 'Pastor',
      status: 'ACTIVE',
    },
    update: {},
  });

  const treasurer = await prisma.person.upsert({
    where: { id: 'p-church-treas' },
    create: {
      id: 'p-church-treas',
      fullName: 'Church Treasurer Bootstrap',
      preferredName: 'Treasurer',
      status: 'ACTIVE',
    },
    update: {},
  });

  // Bootstrap sign-ins for the church leader and treasurer. Locally they keep
  // the well-known demo passwords. On a real deployment (NODE_ENV=production)
  // they are created only when you choose the passwords, and never reset.
  const isProd = process.env.NODE_ENV === 'production';
  const pastorPassword = process.env.BOOTSTRAP_PASTOR_PASSWORD ?? (isProd ? '' : 'pastor123');
  const treasPassword = process.env.BOOTSTRAP_TREASURER_PASSWORD ?? (isProd ? '' : 'treas123');
  for (const [pw, name] of [[pastorPassword, 'BOOTSTRAP_PASTOR_PASSWORD'], [treasPassword, 'BOOTSTRAP_TREASURER_PASSWORD']] as const) {
    if (pw && pw.length < 10 && isProd) throw new Error(`${name} must be at least 10 characters`);
  }

  if (pastorPassword) {
    await prisma.account.upsert({
      where: { username: 'pastor' },
      create: {
        id: 'acc-pastor',
        personId: pastor.id,
        username: 'pastor',
        passwordHash: await bcrypt.hash(pastorPassword, 10),
      },
      update: {},
    });
  } else {
    console.log('  no "pastor" sign-in created: set BOOTSTRAP_PASTOR_PASSWORD (10+ characters) to create it');
  }

  if (treasPassword) {
    await prisma.account.upsert({
      where: { username: 'treasurer' },
      create: {
        id: 'acc-church-treas',
        personId: treasurer.id,
        username: 'treasurer',
        passwordHash: await bcrypt.hash(treasPassword, 10),
      },
      update: {},
    });
  } else {
    console.log('  no "treasurer" sign-in created: set BOOTSTRAP_TREASURER_PASSWORD (10+ characters) to create it');
  }

  // Appointments keep their identity from one start to the next: delegations and the audit
  // trail point at them, so they are created once and never wiped and re-created.
  if (!(await prisma.position.findFirst({ where: { personId: pastor.id, systemRole: 'CHURCH_LEADER' } }))) {
    await prisma.position.create({
      data: {
        personId: pastor.id,
        systemId: 'sys-main',
        orgUnitId: ouChurch.id,
        title: 'Senior Pastor',
        systemRole: 'CHURCH_LEADER',
        office: 'CHURCH_LEADER',
        grantsAllSystems: true,
        status: 'ACTIVE',
      },
    });
  }

  if (!(await prisma.position.findFirst({ where: { personId: treasurer.id, systemRole: 'CHURCH_TREASURER' } }))) {
    await prisma.position.create({
      data: {
        personId: treasurer.id,
        systemId: 'sys-finance',
        orgUnitId: ouFinance.id,
        title: 'Church Treasurer',
        systemRole: 'CHURCH_TREASURER',
        office: 'CHURCH_TREASURER',
        status: 'ACTIVE',
      },
    });
  }

  await prisma.membership.upsert({
    where: { id: 'mem-pastor-main' },
    create: {
      id: 'mem-pastor-main',
      personId: pastor.id,
      systemId: 'sys-main',
      orgUnitId: ouChurch.id,
      type: 'CHURCH_MEMBER',
      label: 'Church member',
      status: 'ACTIVE',
    },
    update: {},
  });

  await prisma.membership.upsert({
    where: { id: 'mem-treas-main' },
    create: {
      id: 'mem-treas-main',
      personId: treasurer.id,
      systemId: 'sys-main',
      orgUnitId: ouChurch.id,
      type: 'CHURCH_MEMBER',
      label: 'Church member',
      status: 'ACTIVE',
    },
    update: {},
  });

  for (const kit of MINISTRY_KIT_ORGS) {
    const ou = await prisma.orgUnit.upsert({
      where: { id: kit.orgId },
      create: {
        id: kit.orgId,
        name: kit.orgName,
        type: 'MINISTRY',
        parentId: ouChurch.id,
        systemId: kit.systemId,
      },
      update: { name: kit.orgName },
    });
    await prisma.churchSystem.update({
      where: { id: kit.systemId },
      data: { orgUnitId: ou.id },
    });
  }

  for (const kit of SPECIAL_MINISTRY_ORGS) {
    const place = { name: kit.orgName, type: kit.kind, kind: kit.kind, parentId: kit.parentId === 'ou-church' ? ouChurch.id : kit.parentId, systemId: kit.systemId };
    const ou = await prisma.orgUnit.upsert({
      where: { id: kit.orgId },
      create: { id: kit.orgId, ...place },
      // Reseeding also corrects older shapes: the Media team and the Protocol team are teams, and both Deacons and Protocol sit under the Deacon Ministry.
      update: place,
    });
    if (kit.link) {
      await prisma.churchSystem.update({
        where: { id: kit.systemId },
        data: { orgUnitId: ou.id },
      });
    }
  }
  // Media is a team now, not a ministry: if an older seed left it in the ministry list, it no longer reads as one.
  await prisma.orgUnit.updateMany({ where: { id: 'ou-media' }, data: { name: 'Media Team', type: 'TEAM', kind: 'TEAM' } });

  const ouChoirParent = await prisma.orgUnit.upsert({
    where: { id: CHOIR_PARENT_ORG.id },
    create: {
      id: CHOIR_PARENT_ORG.id,
      name: CHOIR_PARENT_ORG.name,
      type: 'MINISTRY',
      parentId: ouChurch.id,
      systemId: CHOIR_PARENT_ORG.systemId,
    },
    update: { name: CHOIR_PARENT_ORG.name },
  });
  await prisma.churchSystem.update({
    where: { id: 'sys-choir' },
    data: { orgUnitId: ouChoirParent.id },
  });
  // The built-in choirs are demo data: on a real deployment the choirs come from
  // the church (the Protocol import with --create-choirs, or Music's lineup).
  const seedChoirs = process.env.NODE_ENV !== 'production' || process.env.SEED_DEFAULT_CHOIRS === 'true';
  for (const choir of seedChoirs ? CHOIR_ORGS : []) {
    // Every choir is a system of its own, with its own unit under the Choir Ministry.
    const systemId = choirSystemId(choir.orgId);
    const slug = choir.orgId.replace(/^ou-choir-/, '');
    const place = { name: choir.name, type: 'TEAM', kind: 'TEAM', parentId: ouChoirParent.id, systemId };
    await prisma.orgUnit.upsert({ where: { id: choir.orgId }, create: { id: choir.orgId, ...place }, update: place });
    await prisma.churchSystem.upsert({
      where: { id: systemId },
      create: { id: systemId, code: choir.code, name: choir.name, shortName: choir.name, kind: 'MINISTRY', basePath: `/systems/choir/${slug}`, description: 'A choir with its own system', orgUnitId: choir.orgId },
      update: { name: choir.name, shortName: choir.name, orgUnitId: choir.orgId },
    });
    // Reseeding moves what was already filed under the old single Choir system into the choir's own system.
    await prisma.position.updateMany({ where: { orgUnitId: choir.orgId }, data: { systemId } });
    await prisma.membership.updateMany({ where: { orgUnitId: choir.orgId }, data: { systemId } });
    await prisma.musicChoir.updateMany({ where: { orgUnitId: choir.orgId }, data: { systemId } });
  }

  // Temporary ENTER for policy smoke + assignment API demos.
  await prisma.assignment.upsert({
    where: { id: 'asgn-treas-protocol-enter' },
    update: {
      personId: treasurer.id,
      systemId: 'sys-protocol',
      status: 'ACTIVE',
    },
    create: {
      id: 'asgn-treas-protocol-enter',
      personId: treasurer.id,
      title: 'Protocol finance support (demo)',
      contextType: 'PROGRAM',
      contextId: 'demo-protocol-support',
      contextLabel: 'Protocol support',
      systemId: 'sys-protocol',
      status: 'ACTIVE',
    },
  });

  // No demo programs / events / tasks / projects — create through the app.
  // Delete leftover demo rows from older seeds.
  await prisma.assignment.deleteMany({
    where: { id: { in: ['asgn-baptism-helper'] } },
  });
  await prisma.program.deleteMany({
    where: { id: { in: ['prog-discipleship', 'prog-youth-cell'] } },
  });
  await prisma.churchEvent.deleteMany({
    where: { id: { in: ['evt-baptism-sep'] } },
  });
  await prisma.workTask.deleteMany({
    where: { id: { in: ['task-welcome-pack'] } },
  });
  await prisma.churchProject.deleteMany({
    where: { id: { in: ['proj-sanctuary-sound'] } },
  });


  // Demo role accounts (music, protocol, protocolpres, …). They have known
  // passwords, so they are created only when asked for — never on a real
  // deployment. With them on the server, each demo login signs in through the
  // API and can share Music / Protocol data across browsers.
  if (process.env.SEED_DEMO_ACCOUNTS === 'true') {
    if (process.env.APP_ENV === 'production') {
      throw new Error('SEED_DEMO_ACCOUNTS=true is not allowed when APP_ENV=production');
    }
    const demo = JSON.parse(
      readFileSync(new URL('./demoAccounts.json', import.meta.url), 'utf8'),
    ) as {
      accountId: string;
      username: string;
      password: string;
      person: {
        id: string;
        fullName: string;
        preferredName: string | null;
        phone: string | null;
        email: string | null;
      };
    }[];
    let added = 0;
    for (const d of demo) {
      const taken = await prisma.account.findFirst({
        where: { OR: [{ username: d.username }, { personId: d.person.id }] },
      });
      if (taken) continue;
      await prisma.person.upsert({
        where: { id: d.person.id },
        create: { ...d.person, status: 'ACTIVE' },
        update: {},
      });
      await prisma.account.create({
        data: {
          id: d.accountId,
          personId: d.person.id,
          username: d.username,
          passwordHash: await bcrypt.hash(d.password, 10),
        },
      });
      added++;
    }
    console.log(`  demo accounts: ${added} added (SEED_DEMO_ACCOUNTS=true)`);

    // The demo church itself: the same people, org units, memberships and positions the
    // app shows in demo mode, so turning a server module on does not shrink the demo.
    // Generated by src/data/demoRoster.test.ts. Existing rows are never overwritten.
    try {
    type R = Record<string, any>;
    const roster = JSON.parse(
      readFileSync(new URL('./demoRoster.json', import.meta.url), 'utf8'),
    ) as { orgUnits: R[]; people: R[]; memberships: R[]; positions: R[] };
    const systems = new Set((await prisma.churchSystem.findMany({ select: { id: true } })).map((x) => x.id));
    const day = (v?: string) => (v ? new Date(v) : undefined);
    // The roster was written when all choirs shared one system: a choir unit's people now belong to that choir's own system.
    const sysOf = (r: R): string | null => (r.systemId === 'sys-choir' && typeof r.orgUnitId === 'string' && r.orgUnitId.startsWith('ou-choir-') ? choirSystemId(r.orgUnitId) : r.systemId ?? null);

    // Parents before children.
    const placed = new Set((await prisma.orgUnit.findMany({ select: { id: true } })).map((x) => x.id));
    let queue = roster.orgUnits.filter((u) => !placed.has(u.id));
    let ouAdded = 0;
    for (let pass = 0; pass < 8 && queue.length; pass++) {
      const next: R[] = [];
      for (const u of queue) {
        if (u.parentId && !placed.has(u.parentId)) { next.push(u); continue; }
        await prisma.orgUnit.create({
          data: {
            id: u.id, name: u.name, type: u.type, description: u.description,
            parentId: u.parentId, leaderPersonId: u.leaderPersonId ?? null,
            systemId: u.systemId && systems.has(u.systemId) ? u.systemId : null,
          },
        });
        placed.add(u.id);
        ouAdded++;
      }
      queue = next;
    }

    let peopleAdded = 0;
    for (const p of roster.people) {
      if (await prisma.person.findUnique({ where: { id: p.id } })) continue;
      await prisma.person.create({ data: { ...p } });
      peopleAdded++;
    }

    let memAdded = 0;
    for (const m of roster.memberships) {
      const msys = sysOf(m);
      if (msys && !systems.has(msys)) continue;
      if (m.orgUnitId && !placed.has(m.orgUnitId)) continue;
      const dup = await prisma.membership.findFirst({
        where: { OR: [{ id: m.id }, { personId: m.personId, systemId: msys, type: m.type, orgUnitId: m.orgUnitId ?? null }] },
      });
      if (dup) continue;
      await prisma.membership.create({
        data: {
          id: m.id, personId: m.personId, type: m.type, label: m.label,
          systemId: msys, orgUnitId: m.orgUnitId ?? null,
          status: m.status, startDate: day(m.startDate) ?? new Date(), endDate: day(m.endDate),
        },
      });
      memAdded++;
    }

    let posAdded = 0;
    for (const p of roster.positions) {
      const psys = sysOf(p);
      if (psys && !systems.has(psys)) continue;
      if (p.orgUnitId && !placed.has(p.orgUnitId)) continue;
      const dup = await prisma.position.findFirst({
        where: { OR: [{ id: p.id }, { personId: p.personId, systemId: psys, title: p.title, status: 'ACTIVE' }] },
      });
      if (dup) continue;
      await prisma.position.create({
        data: {
          id: p.id, personId: p.personId, title: p.title,
          systemId: psys, orgUnitId: p.orgUnitId ?? null,
          systemRole: p.systemRole, ministryOffice: p.ministryOffice, choirOffice: p.choirOffice,
          choirAdvisorRole: p.choirAdvisorRole, worshipOffice: p.worshipOffice,
          protocolOffice: p.protocolOffice, deaconOffice: p.deaconOffice,
          systemAdmin: p.systemAdmin ?? false, grantsAllSystems: p.grantsAllSystems ?? false,
          status: p.status, startDate: day(p.startDate) ?? new Date(), endDate: day(p.endDate),
        },
      });
      posAdded++;
    }
    console.log(`  demo church: ${ouAdded} org units, ${peopleAdded} people, ${memAdded} memberships, ${posAdded} positions added`);
    } catch (err) {
      // Never stop the server from starting over demo data.
      console.warn('  demo church roster skipped:', err instanceof Error ? err.message : err);
    }
  }

  // Demo choirs, protocol roster and a money-and-work year, on any deployment that is not live.
  if (process.env.APP_ENV !== 'production' && process.env.SEED_DEMO_FLOWS !== 'false') {
    try {
      const f = await seedDemoFlows(prisma);
      console.log(`  demo flows: ${f.scheduling.choirs} choirs, ${f.scheduling.members} choir members, ${f.scheduling.roster} protocol people, ${f.money.ministries} ministries with ${f.money.plans} plans and ${f.money.entries} money entries added; more demo content: ${JSON.stringify(f.content)}`);
    } catch (err) {
      console.warn('  demo flows skipped:', err instanceof Error ? err.message : err);
    }
  }

  try {
    const backfilled = await backfillCodes(prisma as never);
    console.log(`  codes: ${backfilled.people} member codes and ${backfilled.units} unit codes issued`);
    const structure = await backfillStructure(prisma as never);
    console.log(`  structure: ${structure.offices} office records and ${structure.kinds} unit kinds filled in`);
  } catch (err) {
    // Never stop the server from starting over a code that could not be issued.
    console.warn('  codes skipped:', err instanceof Error ? err.message : err);
  }

  console.log('Seed OK (bootstrap — no demo mission data)');
  if (!isProd) {
    console.log('  pastor / pastor123  (CHURCH_LEADER)');
    console.log('  treasurer / treas123  (CHURCH_TREASURER)');
  }

  // ─── Idempotent initial scheduling configuration (slice 3.17) ───
  // Represents the verified legacy rules as versioned, tenant-scoped config.
  // Rerunning the seed does not duplicate rows: every insert is guarded by an
  // existence check on the stable natural key (code, or system+category+service).
  try {
    await seedInitialSchedulingConfig(prisma);
  } catch (err) {
    // Never stop the server from starting over configuration that could not be seeded.
    console.warn('  scheduling config seed skipped:', err instanceof Error ? err.message : err);
  }
}

async function seedInitialSchedulingConfig(prisma: import('@prisma/client').PrismaClient): Promise<void> {
  const now = new Date();

  // ── System tenants ──
  const MUSIC = 'sys-music';
  const PROTOCOL = 'sys-protocol';

  // ── Bootstrap actor (church leader) ──
  const actorPosition = await prisma.position.findFirst({ where: { systemRole: 'CHURCH_LEADER' } });
  if (!actorPosition) {
    console.warn('  scheduling config seed skipped: no CHURCH_LEADER position');
    return;
  }
  const actorId = actorPosition.personId;

  // ── ConfigVersion v1 (ACTIVE) ──
  let version = await prisma.configVersion.findFirst({ where: { systemId: MUSIC, version: 1 } });
  if (!version) {
    version = await prisma.configVersion.create({
      data: {
        systemId: MUSIC,
        version: 1,
        label: 'Initial scheduling configuration (legacy rules)',
        status: 'ACTIVE',
        effectiveFrom: now,
        createdByPersonId: actorId,
        reason: 'Initial seed reproducing verified legacy Music and Protocol scheduling rules',
        notesJson: JSON.stringify({ source: 'legacy-hard-coded', slice: '3.17' }),
        validationJson: JSON.stringify({}),
        affectedSchedulesJson: JSON.stringify([]),
      },
    });
  }
  let protocolVersion = await prisma.configVersion.findFirst({ where: { systemId: PROTOCOL, version: 1 } });
  if (!protocolVersion) {
    protocolVersion = await prisma.configVersion.create({
      data: {
        systemId: PROTOCOL,
        version: 1,
        label: 'Initial Protocol scheduling configuration (legacy rules)',
        status: 'ACTIVE',
        effectiveFrom: now,
        createdByPersonId: actorId,
        reason: 'Initial seed reproducing verified legacy Protocol scheduling rules',
        notesJson: JSON.stringify({ source: 'legacy-hard-coded', slice: '3.17' }),
        validationJson: JSON.stringify({}),
        affectedSchedulesJson: JSON.stringify([]),
      },
    });
  }

  // ── Shared scheduling calendar (owned once by Music) ──
  // Five service types from the legacy engine: SS1, SS2, TUESDAY, FRIDAY, IGABURO.
  // SS1, SS2, TUESDAY, IGABURO are used by both Music and Protocol. FRIDAY is Music-only.
  const services = [
    { systemId: MUSIC, code: 'ss1', name: 'Sunday Service 1', kind: 'SERVICE', weekday: 0, time: '09:00', musicRequired: true, protocolRequired: true, maxChoirs: 3, configVersionId: version.id, displayOrder: 0 },
    { systemId: MUSIC, code: 'ss2', name: 'Sunday Service 2', kind: 'SERVICE', weekday: 0, time: '11:00', musicRequired: true, protocolRequired: true, maxChoirs: 3, configVersionId: version.id, displayOrder: 1 },
    { systemId: MUSIC, code: 'tuesday', name: 'Tuesday Service', kind: 'SERVICE', weekday: 2, time: '18:00', musicRequired: true, protocolRequired: true, maxChoirs: 3, configVersionId: version.id, displayOrder: 2 },
    { systemId: MUSIC, code: 'friday', name: 'Friday Service', kind: 'SERVICE', weekday: 5, time: '18:00', musicRequired: true, protocolRequired: false, maxChoirs: 3, configVersionId: version.id, displayOrder: 3 },
    { systemId: MUSIC, code: 'igaburo', name: 'Igaburo (Holy Communion)', kind: 'SERVICE', weekday: null, time: null, recurrence: 'MONTHLY', musicRequired: true, protocolRequired: true, maxChoirs: 3, configVersionId: version.id, displayOrder: 4 },
  ];
  const serviceIds = new Map<string, string>();
  for (const s of services) {
    const existing = await prisma.schedulingService.findFirst({ where: { systemId: s.systemId, code: s.code } });
    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      const created = await prisma.schedulingService.create({
        data: {
          ...s, systemId: s.systemId, code: s.code, name: s.name, kind: s.kind,
          weekday: s.weekday, time: s.time, recurrence: s.recurrence ?? 'WEEKLY',
          selectedDatesJson: '[]', active: true, effectiveFrom: now,
          musicRequired: s.musicRequired, protocolRequired: s.protocolRequired,
          displayOrder: s.displayOrder, createdByPersonId: actorId,
        },
      });
      id = created.id;
    }
    serviceIds.set(`${s.systemId}|${s.code}`, id);
  }

  // ── Choir categories (Music) ──
  // Four categories from the legacy ROLES: PRIMARY, SECONDARY, CHILDREN, WORSHIP.
  const categories = [
    { code: 'PRIMARY', name: 'Primary Choir', description: 'Adult primary choir' },
    { code: 'SECONDARY', name: 'Secondary Choir', description: 'Adult secondary choir' },
    { code: 'CHILDREN', name: 'Children’s Choir', description: 'Children / Sunday School choir' },
    { code: 'WORSHIP', name: 'Worship Team', description: 'Worship team (music only)' },
  ];
  const categoryIds = new Map<string, string>();
  for (const c of categories) {
    const existing = await prisma.choirCategory.findFirst({ where: { systemId: MUSIC, code: c.code } });
    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      const created = await prisma.choirCategory.create({
        data: {
          systemId: MUSIC, code: c.code, name: c.name, description: c.description,
          active: true, effectiveFrom: now, configVersionId: version.id, createdByPersonId: actorId,
        },
      });
      id = created.id;
    }
    categoryIds.set(c.code, id);
  }

  // ── Category × service policies ──
  // Legacy behavior:
  //  - Children's choirs only at SS1 (first Sunday service)
  //  - Worship team only on Tuesday
  //  - Primary and Secondary at SS1, SS2, TUESDAY, IGABURO
  //  - A choir at most once per service (frequency target 1)
  const policyRows = [
    // PRIMARY: eligible at SS1, SS2, TUESDAY, IGABURO; not FRIDAY
    // maxCount: 1 per service (one primary per service); Friday/Tuesday exactly 1 primary
    // Igaburo exactly 2 primaries (handled by minCount=maxCount=2)
    { category: 'PRIMARY', service: 'ss1', eligible: true, target: 1, minCount: null, maxCount: 1, requireAll: false },
    { category: 'PRIMARY', service: 'ss2', eligible: true, target: 1, minCount: null, maxCount: 1, requireAll: false },
    { category: 'PRIMARY', service: 'tuesday', eligible: true, target: 1, minCount: 1, maxCount: 1, requireAll: false },
    { category: 'PRIMARY', service: 'igaburo', eligible: true, target: 1, minCount: 2, maxCount: 2, requireAll: false },
    // SECONDARY: same as PRIMARY for eligibility, maxCount 1 per service
    { category: 'SECONDARY', service: 'ss1', eligible: true, target: 1, minCount: null, maxCount: 1, requireAll: false },
    { category: 'SECONDARY', service: 'ss2', eligible: true, target: 1, minCount: null, maxCount: 1, requireAll: false },
    { category: 'SECONDARY', service: 'tuesday', eligible: true, target: 1, minCount: null, maxCount: 1, requireAll: false },
    { category: 'SECONDARY', service: 'igaburo', eligible: true, target: 1, minCount: null, maxCount: 1, requireAll: false },
    // CHILDREN: only SS1; maxCount 3 (all children choirs on SS1)
    { category: 'CHILDREN', service: 'ss1', eligible: true, target: null, minCount: null, maxCount: 3, requireAll: false },
    { category: 'CHILDREN', service: 'ss2', eligible: false },
    { category: 'CHILDREN', service: 'tuesday', eligible: false },
    { category: 'CHILDREN', service: 'igaburo', eligible: false },
    { category: 'CHILDREN', service: 'friday', eligible: false },
    // WORSHIP: only TUESDAY; requireAll=true (all worship on Tuesday)
    { category: 'WORSHIP', service: 'ss1', eligible: false },
    { category: 'WORSHIP', service: 'ss2', eligible: false },
    { category: 'WORSHIP', service: 'tuesday', eligible: true, target: null, minCount: null, maxCount: null, requireAll: true },
    { category: 'WORSHIP', service: 'igaburo', eligible: false },
    { category: 'WORSHIP', service: 'friday', eligible: false },
  ];
  for (const p of policyRows) {
    const catId = categoryIds.get(p.category);
    const svcId = serviceIds.get(`${MUSIC}|${p.service}`);
    if (!catId || !svcId) continue;
    const existing = await prisma.categoryServicePolicy.findFirst({
      where: { systemId: MUSIC, categoryId: catId, serviceId: svcId },
    });
    if (!existing) {
      await prisma.categoryServicePolicy.create({
        data: {
          systemId: MUSIC, categoryId: catId, serviceId: svcId,
          eligible: p.eligible ?? true,
          active: true,
          frequencyTarget: p.target ?? null,
          frequencyCounting: 'ASSIGNMENTS',
          frequencyKind: 'TARGET',
          planningMode: 'ROTATION',
          minCount: p.minCount ?? null,
          maxCount: p.maxCount ?? null,
          requireAll: p.requireAll ?? false,
          configVersionId: version.id,
          effectiveFrom: now, createdByPersonId: actorId,
        },
      });
    }
  }

  // ── Protocol service rules ──
  // Legacy: SS1, SS2, TUESDAY, IGABURO require Protocol staffing; FRIDAY does not.
  // defaultTeamSize=10, requireChoir=true, requireWorship=true.
  const protocolRuleRows = [
    { service: 'ss1', required: true, defaultTeamSize: 10, requireChoir: true, requireWorship: true },
    { service: 'ss2', required: true, defaultTeamSize: 10, requireChoir: true, requireWorship: true },
    { service: 'tuesday', required: true, defaultTeamSize: 10, requireChoir: true, requireWorship: true },
    { service: 'igaburo', required: true, defaultTeamSize: 10, requireChoir: true, requireWorship: true },
  ];
  for (const r of protocolRuleRows) {
    const svcId = serviceIds.get(`${MUSIC}|${r.service}`);
    if (!svcId) continue;
    const existing = await prisma.protocolServiceRule.findFirst({ where: { systemId: PROTOCOL, serviceId: svcId, configVersionId: protocolVersion.id } });
    if (!existing) {
      await prisma.protocolServiceRule.create({
        data: {
          systemId: PROTOCOL, serviceId: svcId,
          active: true,
          required: r.required, defaultTeamSize: r.defaultTeamSize,
          teamSizeOverridesJson: '{}',
          requireChoir: r.requireChoir, requireWorship: r.requireWorship,
          relaxableKindsJson: '[]', configVersionId: protocolVersion.id,
          effectiveFrom: now, createdByPersonId: actorId,
        },
      });
    }
  }

  // ── Protocol duty policy ──
  // Legacy BASE_RULES: preferTarget=3, softMax=3, hardMax=4, defaultTeamSize=10.
  const existingPolicy = await prisma.protocolDutyPolicy.findFirst({ where: { systemId: PROTOCOL, configVersionId: protocolVersion.id } });
  if (!existingPolicy) {
      await prisma.protocolDutyPolicy.create({
        data: {
          systemId: PROTOCOL,
          preferTarget: 3, softMax: 3, hardMax: 4,
          extraDutyPolicy: 'ALLOW_WHEN_SHORT',
          duplicateSameDayAllowed: false,
          musicCompatibilityRequired: true,
          leadershipPrioritiesJson: '[]',
          exceptionsAllowed: true,
          configVersionId: protocolVersion.id,
          effectiveFrom: now, createdByPersonId: actorId,
        },
      });
  }

  // Pin pre-versioned schedules to the seeded legacy-rule snapshots once.
  await prisma.musicMonth.updateMany({
    where: { configVersionId: null },
    data: { configVersionId: version.id },
  });
  await prisma.musicDraft.updateMany({
    where: { configVersionId: null },
    data: { configVersionId: version.id },
  });
  await prisma.musicLog.updateMany({
    where: { configVersionId: null },
    data: { configVersionId: version.id },
  });
  await prisma.protocolPlan.updateMany({
    where: { configVersionId: null },
    data: { configVersionId: protocolVersion.id },
  });
  await prisma.protocolHistory.updateMany({
    where: { configVersionId: null },
    data: { configVersionId: protocolVersion.id },
  });

  console.log(`  scheduling config: version v1, ${services.length} services, ${categories.length} categories, ${policyRows.length} policies, ${protocolRuleRows.length} protocol rules, 1 duty policy`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
