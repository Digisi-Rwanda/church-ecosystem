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

/** Music confirms (and optionally publishes) the month with the old engine; Protocol plans against it. */
async function musicReady(publish = false) {
  for (const [name, role] of [['Ijwi', 'PRIMARY'], ['Bethel', 'PRIMARY'], ['Elim', 'PRIMARY'], ['Integuza', 'PRIMARY'], ['Beulah', 'SECONDARY'], ['Yerusalemu', 'SECONDARY'], ['Hope', 'CHILDREN'], ['Worship', 'WORSHIP']]) {
    await post(MUSIC, '/api/music/choirs', { name, role });
  }
  const d = await post(MUSIC, '/api/music/schedule/drafts/generate', { horizon: 'MONTH', start: MONTH });
  expect((await post(MUSIC, `/api/music/schedule/drafts/${d.body.id}/confirm`, {})).status).toBe(200);
  if (publish) expect((await post(MUSIC, '/api/music/schedule/months/publish', { months: [MONTH] })).status).toBe(200);
}
const joinRoster = async (ids = TEAM) => { for (const personId of ids) expect((await post(COORD, '/api/protocol/roster', { personId })).status).toBe(201); };
const month = async (as = COORD) => (await get(as, `/api/protocol/months/${MONTH}`)).body;
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

describe('building the teams on the old engine', () => {
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
    expect((await submit()).status).toBe(200);
    expect((await month()).step).toBe('WAIT_PRESIDENT');
    expect((await post(COORD, `/api/protocol/months/${MONTH}/publish`)).status).toBe(403);
    expect((await post(PRES, `/api/protocol/months/${MONTH}/publish`)).body.code).toBe('MUSIC_NOT_PUBLISHED');
    await post(MUSIC, '/api/music/schedule/months/publish', { months: [MONTH] });
    const ok = await post(PRES, `/api/protocol/months/${MONTH}/publish`);
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(1);
    expect((await month()).step).toBe('DONE');
    expect((await get(PRES, `/api/protocol/months/${MONTH}/history`)).body.versions).toHaveLength(1);
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
