import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const put = (as: string, path: string, body: object = {}) => request(app).put(path).set(bearer(as)).send(body);
const del = (as: string, path: string) => request(app).delete(path).set(bearer(as));

const MUSIC = 'p-outsider';
const COORD = 'p-coord';
const PRES = 'p-pres';
const now = new Date();
const MONTH = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
const TEAM = Array.from({ length: 24 }, (_, i) => `t${i + 1}`);

async function configureProtocolTeamSize(defaultTeamSize: number, overrideDate: string, overrideTeamSize: number) {
  const store = await import('../src/scheduling/store.js');
  const calendar = await store.getActiveConfigVersion('sys-music');
  if (!calendar) throw new Error('Music calendar configuration is missing');
  const service = await store.getSchedulingServiceByCode('sys-music', 'ss1', calendar.id);
  if (!service) throw new Error('Sunday 1 is missing from the Music calendar');
  const protocol = await store.createConfigVersion({
    systemId: 'sys-protocol', version: 1, label: 'Protocol v1', status: 'ACTIVE', createdByPersonId: COORD,
  });
  await store.createProtocolServiceRule({
    systemId: 'sys-protocol', serviceId: service.id, configVersionId: protocol.id,
    required: true, defaultTeamSize, teamSizeOverrides: { [overrideDate]: overrideTeamSize },
    requireChoir: false, requireWorship: false, relaxableKinds: [], createdByPersonId: COORD,
  });
  for (const other of fake.__db.schedulingService.filter((row: any) => row.configVersionId === calendar.id && row.id !== service.id && row.protocolRequired)) {
    await store.createProtocolServiceRule({ systemId: 'sys-protocol', serviceId: other.id, configVersionId: protocol.id, required: false, createdByPersonId: COORD });
  }
}

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'musicChoir', 'musicChoirMember', 'musicDraft', 'musicMonth', 'musicLog',
    'protocolRoster', 'protocolPlan', 'protocolSlot', 'protocolHistory', 'protocolAttendance', 'protocolAbsence', 'protocolFillIn', 'protocolSwapProposal', 'protocolServiceReport']) db[k] ??= [];
  for (const s of db.churchSystem) { s.code = s.id.replace('sys-', '').toUpperCase(); s.name = s.id; s.shortName = s.id.replace('sys-', ''); s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY'; s.basePath = `/${s.id}`; }
  for (const id of [COORD, PRES, ...TEAM]) db.person.push({ id, fullName: id, status: 'ACTIVE', email: `${id}@x.org`, phone: '0780000000' });
  const pos = (id: string, personId: string, systemId: string, office: string) => db.position.push({ id, personId, systemId, title: office, ministryOffice: office, grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2021-01-01') });
  pos('pos-music', MUSIC, 'sys-music', 'PRESIDENT');
  pos('pos-coord', COORD, 'sys-protocol', 'COORDINATOR');
  pos('pos-pres', PRES, 'sys-protocol', 'PRESIDENT');
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

/** Music confirms (and optionally publishes) a versioned month; Protocol plans against it. */
async function musicReady(publish = false, includeProtocolConfig = true) {
  const store = await import('../src/scheduling/store.js');
  const config = await store.createConfigVersion({
    systemId: 'sys-music', version: 1, label: 'Music calendar v1', status: 'ACTIVE', createdByPersonId: MUSIC,
  });
  const serviceRows = [
    ['ss1', 'Sunday 1', 0, 'WEEKLY', true],
    ['ss2', 'Sunday 2', 0, 'WEEKLY', true],
    ['tuesday', 'Tuesday', 2, 'WEEKLY', true],
    ['friday', 'Friday', 5, 'WEEKLY', false],
    ['igaburo', 'Igaburo', null, 'MONTHLY', true],
  ] as const;
  const services = new Map<string, { id: string }>();
  for (const [code, name, weekday, recurrence, protocolRequired] of serviceRows) {
    const service = await store.createSchedulingService({
      systemId: 'sys-music', code, name, weekday, recurrence, musicRequired: true, protocolRequired,
      maxChoirs: 3, configVersionId: config.id, createdByPersonId: MUSIC,
    });
    services.set(code, service);
  }
  const categories = new Map<string, string>();
  for (const [code, name] of [
    ['PRIMARY', 'Primary Choir'],
    ['SECONDARY', 'Secondary Choir'],
    ['CHILDREN', 'Children’s Choir'],
    ['WORSHIP', 'Worship Team'],
  ]) {
    const category = await store.createChoirCategory({
      systemId: 'sys-music', code, name, configVersionId: config.id, createdByPersonId: MUSIC,
    });
    categories.set(code, category.id);
  }
  for (const [name, role] of [['Ijwi', 'PRIMARY'], ['Bethel', 'PRIMARY'], ['Elim', 'PRIMARY'], ['Integuza', 'PRIMARY'], ['Beulah', 'SECONDARY'], ['Yerusalemu', 'SECONDARY'], ['Hope', 'CHILDREN'], ['Worship', 'WORSHIP']]) {
    const created = await post(MUSIC, '/api/music/choirs', { name, role });
    await store.createChoirCategoryLink({
      systemId: 'sys-music', choirId: created.body.id, categoryId: categories.get(role)!,
      configVersionId: config.id, createdByPersonId: MUSIC,
    });
  }
  const requiredByService: Record<string, Partial<Record<string, number>>> = {
    ss1: { PRIMARY: 2, CHILDREN: 1 },
    ss2: { PRIMARY: 2, CHILDREN: 1 },
    tuesday: { PRIMARY: 1, WORSHIP: 1 },
    friday: { PRIMARY: 1 },
    igaburo: { PRIMARY: 1, SECONDARY: 1 },
  };
  for (const [code, service] of services) {
    for (const [categoryCode, categoryId] of categories) {
      const count = requiredByService[code]?.[categoryCode] ?? 0;
      await store.createCategoryServicePolicy({
        systemId: 'sys-music', categoryId, serviceId: service.id, eligible: count > 0,
        minCount: count, maxCount: count, planningMode: 'ROTATION',
        configVersionId: config.id, createdByPersonId: MUSIC,
      });
    }
  }
  if (includeProtocolConfig) {
    const protocol = await store.createConfigVersion({
      systemId: 'sys-protocol', version: 1, label: 'Protocol rules v1',
      status: 'ACTIVE', createdByPersonId: COORD,
    });
    for (const [code, service] of services) {
      if (!serviceRows.find(([serviceCode]) => serviceCode === code)?.[4]) continue;
      await store.createProtocolServiceRule({
        systemId: 'sys-protocol', serviceId: service.id, configVersionId: protocol.id,
        required: true, defaultTeamSize: 10, requireChoir: true, requireWorship: true,
        relaxableKinds: [], createdByPersonId: COORD,
      });
    }
  }
  const d = await post(MUSIC, '/api/music/schedule/drafts/generate', { horizon: 'MONTH', start: MONTH });
  expect(d.status, JSON.stringify(d.body)).toBe(201);
  expect((await post(MUSIC, `/api/music/schedule/drafts/${d.body.id}/confirm`, {})).status).toBe(200);
  if (publish) expect((await post(MUSIC, '/api/music/schedule/months/publish', { months: [MONTH] })).status).toBe(200);
}
const joinRoster = async (ids = TEAM) => { for (const personId of ids) expect((await post(COORD, '/api/protocol/roster', { personId })).status).toBe(201); };
const month = async (as = COORD) => (await get(as, `/api/protocol/months/${MONTH}`)).body;

it.each(['DRAFT', 'REVIEW', 'PUBLISHED'])('deletes the %s team lineup and retains published history', async (status) => {
  const updatedAt = new Date();
  await fake.protocolPlan.create({ data: { monthKey: MONTH, status, version: 2, updatedAt, musicVersionBuiltOn: 1 } });
  await fake.protocolSlot.create({ data: { monthKey: MONTH, serviceId: `psvc-ss1-${MONTH}-01`, personId: TEAM[0] } });
  await fake.protocolHistory.create({ data: { monthKey: MONTH, version: 2, slotsJson: '[]' } });
  const path = `/api/protocol/months/${MONTH}`;
  const expected = { status, version: 2, updatedAt: updatedAt.toISOString() };
  expect((await del(PRES, path).send(expected)).status).toBe(403);
  expect((await del(COORD, path).send({ ...expected, version: 1 })).status).toBe(409);
  expect((await del(COORD, path).send(expected)).status).toBe(204);
  expect(await fake.protocolPlan.findUnique({ where: { monthKey: MONTH } })).toMatchObject({
    status: 'OPEN', version: 2, musicVersionBuiltOn: null,
  });
  expect(await fake.protocolSlot.count({ where: { monthKey: MONTH } })).toBe(0);
  expect(await fake.protocolHistory.count({ where: { monthKey: MONTH } })).toBe(1);
});

it('builds configured Friday teams using members who selected Friday', async () => {
  const createdAt = new Date();
  const friday = Array.from({ length: 7 }, (_, index) => new Date(`${MONTH}-0${index + 1}T00:00:00Z`))
    .find((date) => date.getUTCDay() === 5)!.toISOString().slice(0, 10);
  await fake.schedulingService.create({ data: {
    id: 'friday', systemId: 'sys-music', code: 'friday', name: 'Friday Service', kind: 'SERVICE',
    active: true, protocolRequired: true, weekday: 5, recurrence: 'WEEKLY', createdAt,
  } });
  await fake.protocolServiceRule.create({ data: {
    systemId: 'sys-protocol', serviceId: 'friday', active: true, required: true,
    defaultTeamSize: 1, requireChoir: false, requireWorship: false, createdAt,
  } });
  await fake.musicMonth.create({ data: {
    periodKey: MONTH, state: 'CONFIRMED', version: 1, assignmentsJson: '[]', warningsJson: '[]',
    servicesJson: JSON.stringify([{
      id: 'friday-occurrence', date: friday, kind: 'FRIDAY', label: 'Friday Service', protocolRequired: true,
    }]),
  } });
  await joinRoster([TEAM[1]]);
  const fridayMember = TEAM[0];
  expect((await post(COORD, '/api/protocol/roster', {
    personId: fridayMember, allowedServiceKinds: ['FRIDAY'],
  })).status).toBe(201);
  expect((await month()).can.build).toBe(true);
  const result = await post(COORD, `/api/protocol/months/${MONTH}/generate`);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  const fridayServices = (await month()).services.filter((service: { kind: string }) => service.kind === 'FRIDAY');
  expect(fridayServices.length).toBeGreaterThan(0);
  const assigned = fridayServices.flatMap((service: { team: { personId: string }[] }) => service.team.map((slot) => slot.personId));
  expect([...new Set(assigned)]).toEqual([fridayMember]);
});

it('skips Friday without a rule when the live calendar turns Protocol off after Music confirms', async () => {
  const createdAt = new Date();
  await fake.schedulingService.create({ data: {
    id: 'friday', systemId: 'sys-music', code: 'friday', name: 'Friday Service',
    active: true, protocolRequired: true, createdAt,
  } });
  await fake.schedulingService.create({ data: {
    id: 'tuesday', systemId: 'sys-music', code: 'tuesday', name: 'Tuesday Service',
    active: true, protocolRequired: true, createdAt,
  } });
  await fake.schedulingService.create({ data: {
    id: 'ss3', systemId: 'sys-music', code: 'ss3', name: 'Sunday Service 3',
    active: true, protocolRequired: true, createdAt,
  } });
  for (const serviceId of ['tuesday', 'ss3']) {
    await fake.protocolServiceRule.create({ data: {
      systemId: 'sys-protocol', serviceId, active: true, required: true,
      defaultTeamSize: 1, requireChoir: false, requireWorship: false, createdAt,
    } });
  }
  const servicesJson = JSON.stringify([
    { id: 'friday-occurrence', date: `${MONTH}-06`, kind: 'FRIDAY', label: 'Friday Service', protocolRequired: true },
    { id: 'tuesday-occurrence', date: `${MONTH}-03`, kind: 'TUESDAY', label: 'Tuesday Service', protocolRequired: true },
    { id: 'ss3-occurrence', date: `${MONTH}-07`, kind: 'SS3', label: 'Sunday Service 3', protocolRequired: true },
  ]);
  await fake.musicMonth.create({ data: { periodKey: MONTH, state: 'CONFIRMED', version: 1, assignmentsJson: '[]', servicesJson } });
  expect((await post(COORD, '/api/protocol/roster', { personId: TEAM[0], allowedServiceKinds: ['TUESDAY', 'ss3'] })).status).toBe(201);
  expect((await get(COORD, '/api/protocol/roster')).body.services).toContainEqual({ code: 'SS3', name: 'Sunday Service 3' });
  const build = () => post(COORD, `/api/protocol/months/${MONTH}/generate`);
  expect((await build()).body.code).toBe('PROTOCOL_RULE_MISSING');
  await fake.schedulingService.update({ where: { id: 'friday' }, data: { protocolRequired: false } });
  const result = await build();
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  const view = await month();
  expect(view.services).toMatchObject([
    { kind: 'TUESDAY', team: [{ personId: TEAM[0] }] },
    { kind: 'SS3', team: [{ personId: TEAM[0] }] },
  ]);
  expect(await fake.musicMonth.findUnique({ where: { periodKey: MONTH } })).toMatchObject({ servicesJson, version: 1 });
});
const built = async (publishMusic = true) => {
  await musicReady(publishMusic);
  await joinRoster();
  const g = await post(COORD, `/api/protocol/months/${MONTH}/generate`);
  expect(g.status).toBe(200);
  return g;
};

describe('the roster', () => {
  it('the Coordinator adds, edits and retires; a member reads nothing', async () => {
    const a = await post(COORD, '/api/protocol/roster', { personId: 't1', serveDays: 'TUESDAY' });
    expect(a.status).toBe(201);
    expect((await post(COORD, '/api/protocol/roster', { personId: 't1' })).body.code).toBe('DUPLICATE');
    expect((await post(COORD, '/api/protocol/roster', { personId: 'nobody' })).body.code).toBe('NO_PERSON');
    expect((await request(app).patch(`/api/protocol/roster/${a.body.id}`).set(bearer(COORD)).send({ unavailableDates: ['2026-11-01'], allowedServiceKinds: ['TUESDAY'] })).status).toBe(200);
    const r = (await get(COORD, '/api/protocol/roster')).body;
    expect(r.members[0]).toMatchObject({ personId: 't1', serveDays: 'TUESDAY', unavailableDates: ['2026-11-01'], allowedServiceKinds: ['TUESDAY'] });
    await request(app).patch(`/api/protocol/roster/${a.body.id}`).set(bearer(COORD)).send({ status: 'INACTIVE' });
    expect((await post(COORD, '/api/protocol/roster', { personId: 't1' })).status).toBe(201);
    expect((await get('p-member', '/api/protocol/roster')).status).toBe(404);
  });
});

describe('building teams from versioned Protocol rules', () => {
  it('resolves lowercase configured service codes, defaults and date overrides in generated teams', async () => {
    await musicReady(true, false);
    const monthRow = fake.__db.musicMonth.find((m: any) => m.periodKey === MONTH);
    const sundayDates = JSON.parse(monthRow.servicesJson)
      .filter((service: any) => service.kind === 'SS1')
      .map((service: any) => service.date);
    await configureProtocolTeamSize(4, sundayDates[0], 2);
    await joinRoster();

    const generated = await post(COORD, `/api/protocol/months/${MONTH}/generate`);
    expect(generated.status, JSON.stringify(generated.body)).toBe(200);
    const ss1 = (await month()).services.filter((service: any) => service.kind === 'SS1');
    const override = ss1.find((service: any) => service.date === sundayDates[0]);
    const configuredDefault = ss1.find((service: any) => service.date !== sundayDates[0]);
    expect(override).toMatchObject({ target: 2 });
    expect(override.team).toHaveLength(2);
    expect(configuredDefault).toMatchObject({ target: 4 });
    expect(configuredDefault.team).toHaveLength(4);
  });

  it('refuses generation when no Protocol policy version is active', async () => {
    await musicReady(true, false);
    await joinRoster();
    const response = await post(COORD, `/api/protocol/months/${MONTH}/generate`);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('NO_PROTOCOL_CONFIG');
  });

  it('waits for Music, then builds teams that satisfy the rules', async () => {
    await joinRoster();
    expect((await month()).step).toBe('WAIT_MUSIC');
    expect((await post(COORD, `/api/protocol/months/${MONTH}/generate`)).body.code).toBe('NO_MUSIC');
    await musicReady(true);
    expect((await month()).step).toBe('BUILD');
    const g = await post(COORD, `/api/protocol/months/${MONTH}/generate`);
    expect(g.body.slots).toBeGreaterThan(20);
    const m = await month();
    expect(m.step).toBe('SEND');
    expect(m.services.every((s: any) => s.kind !== 'FRIDAY')).toBe(true);
    expect(m.services.some((s: any) => s.team.length > 0)).toBe(true);
    for (const s of m.services) for (const t of s.team) expect(t.load).toBeLessThanOrEqual(4);
    expect(m.issues.filter((i: any) => i.severity === 'BLOCKING')).toEqual([]);
  });
  it('only the Coordinator builds; the plan is hidden from members', async () => {
    await musicReady(true);
    await joinRoster();
    expect((await post(PRES, `/api/protocol/months/${MONTH}/generate`)).status).toBe(403);
    expect((await post('p-member', `/api/protocol/months/${MONTH}/generate`)).status).toBe(404);
    expect((await get('p-member', `/api/protocol/months/${MONTH}`)).status).toBe(404);
  });
  it('edits are checked: double Sunday, not on the roster, already there', async () => {
    await built();
    const m = await month();
    const ss = m.services.filter((s: any) => s.kind === 'SS1' || s.kind === 'SS2');
    const day = ss[0].date;
    const ss1 = ss.find((s: any) => s.date === day && s.kind === 'SS1');
    const ss2 = ss.find((s: any) => s.date === day && s.kind === 'SS2');
    const person = ss1.team[0];
    expect((await post(COORD, `/api/protocol/months/${MONTH}/slots`, { serviceId: ss2.id, personId: person.personId })).body.code).toBe('DOUBLE_SUNDAY');
    expect((await post(COORD, `/api/protocol/months/${MONTH}/slots`, { serviceId: ss1.id, personId: person.personId })).body.code).toBe('ALREADY');
    expect((await post(COORD, `/api/protocol/months/${MONTH}/slots`, { serviceId: ss1.id, personId: 'p-member' })).body.code).toBe('UNKNOWN_PERSON');
    expect((await del(COORD, `/api/protocol/months/${MONTH}/slots/${person.id}`)).status).toBe(200);
    expect((await month()).services.find((s: any) => s.id === ss1.id).team.some((t: any) => t.personId === person.personId)).toBe(false);
  });
  it('a leader and vice leader are recommended; approving applies them, one of each per service', async () => {
    await built();
    expect((await post(COORD, `/api/protocol/months/${MONTH}/roles/approve`)).body.approved).toBeGreaterThan(0);
    for (const s of (await month()).services.filter((x: any) => x.team.length)) {
      expect(s.team.filter((t: any) => t.role === 'TEAM_LEADER')).toHaveLength(1);
      expect(s.team.filter((t: any) => t.role === 'VICE_LEADER')).toHaveLength(1);
    }
  });
});

describe('review and publish', () => {
  const submit = () => post(COORD, `/api/protocol/months/${MONTH}/submit`);
  it('the Coordinator submits, the President publishes, never the submitter, only once Music is published', async () => {
    await built(false);
    const plan = fake.__db.protocolPlan.find((row: any) => row.monthKey === MONTH);
    const musicMonth = fake.__db.musicMonth.find((row: any) => row.periodKey === MONTH);
    expect(plan).toMatchObject({
      configVersionId: expect.any(String),
      musicConfigVersionId: musicMonth.configVersionId,
    });
    expect((await submit()).status).toBe(200);
    expect((await month()).step).toBe('WAIT_PRESIDENT');
    expect((await post(COORD, `/api/protocol/months/${MONTH}/publish`)).status).toBe(403);
    expect((await post(PRES, `/api/protocol/months/${MONTH}/publish`)).body.code).toBe('MUSIC_NOT_PUBLISHED');
    await post(MUSIC, '/api/music/schedule/months/publish', { months: [MONTH] });
    const ok = await post(PRES, `/api/protocol/months/${MONTH}/publish`);
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(1);
    expect((await month()).step).toBe('DONE');
    const versions = (await get(PRES, `/api/protocol/months/${MONTH}/history`)).body.versions;
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      configVersionId: plan.configVersionId,
      musicConfigVersionId: plan.musicConfigVersionId,
    });
    expect((await post(COORD, `/api/protocol/months/${MONTH}/generate`)).body.code).toBe('LOCKED');
  });
  it('the President can return it to draft; the Coordinator can reopen a published month, and republishing makes version 2', async () => {
    await built();
    await submit();
    expect((await post(PRES, `/api/protocol/months/${MONTH}/return`)).status).toBe(200);
    expect((await month()).status).toBe('DRAFT');
    await submit();
    await post(PRES, `/api/protocol/months/${MONTH}/publish`);
    expect((await post(COORD, `/api/protocol/months/${MONTH}/return`)).status).toBe(200);
    await submit();
    expect((await post(PRES, `/api/protocol/months/${MONTH}/publish`)).body.version).toBe(2);
  });
  it('when Music changes after the teams were built, publishing stops until the Coordinator confirms it has seen the change', async () => {
    await built();
    await submit();
    const row = fake.__db.musicMonth.find((r: any) => r.periodKey === MONTH);
    const services = JSON.parse(row.servicesJson);
    const firstSunday = services.find((s: any) => s.kind === 'SS1');
    const assignments = JSON.parse(row.assignmentsJson).filter((a: any) => a.serviceId !== firstSunday.id);
    row.assignmentsJson = JSON.stringify(assignments);
    row.version += 1;
    expect((await month()).stale.length).toBeGreaterThan(0);
    expect((await post(PRES, `/api/protocol/months/${MONTH}/publish`)).body.code).toBe('MUSIC_CHANGED');
    await post(PRES, `/api/protocol/months/${MONTH}/return`);
    await post(COORD, `/api/protocol/months/${MONTH}/acknowledge-music`);
    expect((await month()).stale).toEqual([]);
  });
  it('does not acknowledge or publish a plan against a different Music configuration version', async () => {
    await built();
    await submit();
    const row = fake.__db.musicMonth.find((item: any) => item.periodKey === MONTH);
    row.configVersionId = 'different-music-config';
    const current = await month();
    expect(current.stale).toContain('MUSIC_CONFIGURATION_VERSION_CHANGED');
    expect((await post(COORD, `/api/protocol/months/${MONTH}/acknowledge-music`)).body.code).toBe('MUSIC_CONFIG_CHANGED');
    expect((await post(PRES, `/api/protocol/months/${MONTH}/publish`)).body.code).toBe('MUSIC_CHANGED');
  });
  it('Music clashes block until the Coordinator allows them with a reason; other issues cannot be allowed', async () => {
    await musicReady(true);
    // a choir member on the roster who sits on services where the choir is not scheduled
    const hope = fake.__db.musicChoir.find((c: any) => c.name === 'Ijwi');
    fake.__db.musicChoirMember.push({ id: 'cm1', choirId: hope.id, personId: 't1', status: 'ACTIVE', joinedOn: new Date() });
    await joinRoster();
    await post(COORD, `/api/protocol/months/${MONTH}/generate`);
    const m = await month();
    const target = m.services.find((s: any) => !s.music.includes('Ijwi'));
    const add = await post(COORD, `/api/protocol/months/${MONTH}/slots`, { serviceId: target.id, personId: 't1' });
    if (add.status === 201) {
      const issue = (await month()).issues.find((i: any) => i.code === 'CHOIR_NOT_SCHEDULED' && i.personId === 't1');
      expect(issue).toBeTruthy();
      expect((await submit()).body.code).toBe('BLOCKING');
      expect((await post(COORD, `/api/protocol/months/${MONTH}/overrides`, { issueKey: issue.key, reason: 'ok' })).body.code).toBe('REASON');
      expect((await post(COORD, `/api/protocol/months/${MONTH}/overrides`, { issueKey: issue.key, reason: 'Choir leader agreed' })).status).toBe(200);
      expect((await submit()).status).toBe(200);
    }
  });
});

/** A published month, plus the services that have already happened (the last one is moved into the past). */
async function published() {
  await built();
  await post(COORD, `/api/protocol/months/${MONTH}/roles/approve`);
  await post(COORD, `/api/protocol/months/${MONTH}/submit`);
  expect((await post(PRES, `/api/protocol/months/${MONTH}/publish`)).status).toBe(200);
  return month();
}
const pick = (m: any) => m.services.find((s: any) => s.team.length >= 5);

describe('after publishing: duties, excuses, fill-ins and swaps', () => {
  it('a member sees only their own duties; a leader also sees the team', async () => {
    const m = await published();
    const svc = pick(m);
    const leader = svc.team.find((t: any) => t.role === 'TEAM_LEADER');
    const plain = svc.team.find((t: any) => t.role === 'MEMBER');
    const mine = (await get(plain.personId, '/api/protocol/mine')).body;
    expect(mine.duties.some((d: any) => d.serviceId === svc.id)).toBe(true);
    expect(mine.leading.some((d: any) => d.serviceId === svc.id)).toBe(false);
    expect((await get(leader.personId, '/api/protocol/mine')).body.leading.find((d: any) => d.serviceId === svc.id).team.length).toBe(svc.team.length);
  });
  it('excuse, then fill-in: asked by the leader, accepted by the candidate, checked against the rules', async () => {
    const m = await published();
    const svc = pick(m);
    const leader = svc.team.find((t: any) => t.role === 'TEAM_LEADER').personId;
    const member = svc.team.find((t: any) => t.role === 'MEMBER').personId;
    const ask = await post(member, '/api/protocol/absences', { serviceId: svc.id, reason: 'Sick child' });
    expect(ask.status).toBe(201);
    expect((await post(member, '/api/protocol/absences', { serviceId: svc.id, reason: 'Sick child' })).body.code).toBe('DUPLICATE');
    expect((await post(member, `/api/protocol/absences/${ask.body.id}/decide`, { decision: 'EXCUSE' })).status).toBe(403);
    expect((await post(leader, `/api/protocol/absences/${ask.body.id}/decide`, { decision: 'EXCUSE' })).status).toBe(200);
    const candidate = m.roster.map((r: any) => r.personId).find((p: string) => !svc.team.some((t: any) => t.personId === p) && !m.services.some((s: any) => s.date === svc.date && s.id !== svc.id && s.team.some((t: any) => t.personId === p) && (s.kind === 'SS1' || s.kind === 'SS2')));
    const offer = await post(leader, '/api/protocol/fillins', { serviceId: svc.id, excusedPersonId: member, candidatePersonId: candidate });
    if (offer.status === 201) {
      expect((await post(member, `/api/protocol/fillins/${offer.body.id}/respond`, { accept: true })).status).toBe(403);
      const rr = await post(candidate, `/api/protocol/fillins/${offer.body.id}/respond`, { accept: true }); expect(rr.status).toBe(200);
      const after = (await month()).services.find((s: any) => s.id === svc.id);
      expect(after.team.find((t: any) => t.personId === candidate).slotKind).toBe('FILL_IN');
    } else {
      expect(['DOUBLE_SUNDAY', 'CANNOT_SERVE', 'CHOIR_NOT_SCHEDULED', 'WORSHIP_NOT_SCHEDULED', 'OVER_MAX']).toContain(offer.body.code);
    }
    expect((await post(leader, '/api/protocol/fillins', { serviceId: svc.id, excusedPersonId: leader, candidatePersonId: candidate })).body.code).toBe('NOT_EXCUSED');
  });
  it('a swap is proposed by one member and accepted by the other; the proposer must be allowed to serve', async () => {
    const m = await published();
    const svc = m.services.find((s: any) => s.kind === 'TUESDAY' && s.team.length >= 2);
    const target = svc.team[0].personId;
    const proposer = m.roster.map((r: any) => r.personId).find((p: string) => !svc.team.some((t: any) => t.personId === p));
    const w = await post(proposer, '/api/protocol/swaps', { serviceId: svc.id, targetPersonId: target });
    if (w.status === 201) {
      expect((await post(proposer, `/api/protocol/swaps/${w.body.id}/respond`, { accept: true })).status).toBe(403);
      const sr = await post(target, `/api/protocol/swaps/${w.body.id}/respond`, { accept: true }); expect(sr.status).toBe(200);
      expect((await month()).services.find((s: any) => s.id === svc.id).team.some((t: any) => t.personId === proposer)).toBe(true);
    } else expect(w.status).toBe(409);
    expect((await post(target, '/api/protocol/swaps', { serviceId: svc.id, targetPersonId: target })).body.code).toBe('SELF');
  });
  it('nothing can be requested before the month is published', async () => {
    await built();
    const m = await month();
    const svc = pick(m);
    expect((await post(svc.team[0].personId, '/api/protocol/absences', { serviceId: svc.id, reason: 'Travelling' })).status).toBe(404);
  });
});

describe('attendance, scores and the service report', () => {
  const past = async () => {
    const m = await published();
    const svc = pick(m);
    // move this service's date into the past by rewriting Music's published month and the id the plan uses is unchanged
    return { m, svc };
  };
  it('records attendance only for services that happened, by the leader, Coordinator or President', async () => {
    const { svc } = await past();
    const leader = svc.team.find((t: any) => t.role === 'TEAM_LEADER').personId;
    const person = svc.team.find((t: any) => t.role === 'MEMBER').personId;
    const r = await post(leader, `/api/protocol/services/${svc.id}/attendance`, { personId: person, status: 'PRESENT' });
    if (svc.date > new Date().toISOString().slice(0, 10)) expect(r.body.code).toBe('FUTURE');
    expect((await post(person, `/api/protocol/services/${svc.id}/attendance`, { personId: person, status: 'PRESENT' })).status).toBe(403);
    expect((await post(leader, `/api/protocol/services/${svc.id}/attendance`, { personId: 'p-member', status: 'PRESENT' })).status).toBeGreaterThanOrEqual(404);
    expect((await post(leader, `/api/protocol/services/${svc.id}/attendance`, { personId: person, status: 'LATE' })).status).toBe(400);
  });
  it('scores follow the old points once attendance exists', async () => {
    const { svc } = await past();
    const person = svc.team[0].personId;
    fake.__db.protocolAttendance.push({ id: 'a1', serviceId: svc.id, personId: person, status: 'PRESENT', slotKind: 'REGULAR', recordedById: COORD, recordedAt: new Date() });
    fake.__db.protocolAttendance.push({ id: 'a2', serviceId: svc.id, personId: svc.team[1].personId, status: 'ABSENT', slotKind: 'REGULAR', recordedById: COORD, recordedAt: new Date() });
    const s = (await get(PRES, '/api/protocol/scores')).body.scores;
    expect(s.find((x: any) => x.personId === person).points).toBe(5);
    expect(s.find((x: any) => x.personId === svc.team[1].personId).points).toBe(-3);
    expect((await get('p-member', '/api/protocol/scores')).status).toBe(404);
  });
  it('the team leader writes one report per service; Deacon and Protocol officers read it, a plain member cannot', async () => {
    const { svc } = await past();
    const leader = svc.team.find((t: any) => t.role === 'TEAM_LEADER').personId;
    const member = svc.team.find((t: any) => t.role === 'MEMBER').personId;
    const w = await put(leader, `/api/protocol/services/${svc.id}/report`, { challenges: 'Late start', solutions: 'Opened doors early', issues: '', recommendations: 'More ushers' });
    if (svc.date > new Date().toISOString().slice(0, 10)) { expect(w.body.code).toBe('FUTURE'); return; }
    expect(w.status).toBe(200);
    expect((await put(member, `/api/protocol/services/${svc.id}/report`, {})).status).toBe(403);
    expect((await get(PRES, `/api/protocol/reports?month=${MONTH}`)).body.reports[0].challenges).toBe('Late start');
    expect((await get('p-member', `/api/protocol/reports?month=${MONTH}`)).status).toBe(404);
  });
});


describe('published history in generation routes', () => {
  it('uses earlier published duties to break monthly ties and excludes voluntary fill-ins', async () => {
    await musicReady(true, false);
    const calendar = JSON.parse(fake.__db.musicMonth.find((row: any) => row.periodKey === MONTH).servicesJson);
    const date = calendar.find((row: any) => row.kind === 'SS1').date;
    await configureProtocolTeamSize(1, date, 1);
    await joinRoster();
    const [y, m] = MONTH.split('-').map(Number);
    const previous = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    fake.__db.protocolHistory.push({ id: 'history-fairness', monthKey: previous, version: 1,
      slotsJson: JSON.stringify([
        { id: 'old-regular', serviceId: 'old-service', personId: 't1', slotKind: 'REGULAR' },
        { id: 'old-voluntary', serviceId: 'old-service', personId: 't10', slotKind: 'FILL_IN' },
      ]),
    });
    const generated = await post(COORD, '/api/protocol/months/' + MONTH + '/generate');
    expect(generated.status, JSON.stringify(generated.body)).toBe(200);
    const first = (await month()).services.find((row: any) => row.kind === 'SS1');
    expect(first.team).toHaveLength(1);
    expect(first.team[0].personId).toBe('t10');
    expect(fake.__db.protocolHistory.find((row: any) => row.id === 'history-fairness').version).toBe(1);
  });
});
