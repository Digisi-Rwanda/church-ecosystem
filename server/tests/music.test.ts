import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { isMonth } from '../src/music/rules';

describe('music rules', () => {
  it('months', () => {
    expect(isMonth('2026-10')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-1')).toBe(false);
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const del = (as: string, path: string) => request(app).delete(path).set(bearer(as));

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'musicChoir', 'musicChoirMember', 'musicPlan', 'musicService', 'musicAssignment', 'musicMonth', 'musicDraft', 'musicLog']) db[k] ??= [];
  for (const s of db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.shortName = s.id.replace('sys-', '');
    s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  db.position.push({ id: 'pos-music', personId: 'p-outsider', systemId: 'sys-music', title: 'Music Leader', ministryOffice: 'PRESIDENT', grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2021-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const MUSIC_LEADER = 'p-outsider';
const choir = async (name = 'Elim', role = 'PRIMARY') => (await post(MUSIC_LEADER, '/api/music/choirs', { name, role })).body.id as string;

describe('Music and Choir are different systems', () => {
  it('Music holds the register of every choir; a choir system shows only its own and cannot add or retire', async () => {
    await choir('Elim', 'PRIMARY');
    await choir('Praise team', 'WORSHIP');
    const all = await get('p-pastor', '/api/music/choirs');
    expect(all.body.choirs.map((c: any) => c.name).sort()).toEqual(['Elim', 'Praise team']);
    expect(all.body.canManage).toBe(true);
    const inMusic = await get('p-pastor', '/api/music/choirs?systemId=sys-music');
    expect(inMusic.body.choirs).toHaveLength(2);
    expect(inMusic.body.canManage).toBe(true);
    expect(fake.__db.churchSystem.some((s: any) => s.id === 'sys-choir-elim')).toBe(true); // each choir is a system of its own
    expect(fake.__db.orgUnit.find((u: any) => u.id === 'ou-choir-elim')).toMatchObject({ systemId: 'sys-choir-elim', type: 'TEAM' });
    expect((await get('p-pastor', '/api/music/choirs?systemId=sys-choir')).body.choirs).toEqual([]); // the umbrella holds none itself
    const inChoir = await get('p-pastor', '/api/music/choirs?systemId=sys-choir-elim');
    expect(inChoir.body.choirs.map((c: any) => c.name)).toEqual(['Elim']);
    expect(inChoir.body.canManage).toBe(false);
    const inWorship = await get('p-pastor', '/api/music/choirs?systemId=sys-worship');
    expect(inWorship.body.choirs.map((c: any) => c.name)).toEqual(['Praise team']);
    const picks = await get('p-pastor', '/api/choir/choirs?systemId=sys-choir-elim');
    expect(picks.body.choirs.map((c: any) => c.name)).toEqual(['Elim']);
  });
});

describe('choirs and the register', () => {
  it('the Music leader adds choirs; names are unique among active choirs', async () => {
    const id = await choir();
    expect(id).toBeTruthy();
    expect((await post(MUSIC_LEADER, '/api/music/choirs', { name: 'elim', role: 'PRIMARY' })).body.code).toBe('ALREADY_EXISTS');
    expect((await post('p-member', '/api/music/choirs', { name: 'X', role: 'PRIMARY' })).status).toBe(403);
    expect((await post(MUSIC_LEADER, `/api/music/choirs/${id}/active`, { active: false })).status).toBe(200);
    expect(await choir('Elim')).toBeTruthy();
  });
  it('members join and leave; people outside cannot see the register', async () => {
    const id = await choir();
    expect((await post(MUSIC_LEADER, `/api/music/choirs/${id}/members`, { personId: 'p-member' })).status).toBe(201);
    expect((await post(MUSIC_LEADER, `/api/music/choirs/${id}/members`, { personId: 'p-member' })).body.code).toBe('ALREADY_EXISTS');
    expect((await post(MUSIC_LEADER, `/api/music/choirs/${id}/members`, { personId: 'nobody' })).body.code).toBe('PERSON_NOT_ACTIVE');
    expect((await get(MUSIC_LEADER, `/api/music/choirs/${id}`)).body.members).toHaveLength(1);
    expect((await get('p-member', `/api/music/choirs/${id}`)).status).toBe(404);
    expect((await del(MUSIC_LEADER, `/api/music/choirs/${id}/members/p-member`)).status).toBe(200);
    expect((await get(MUSIC_LEADER, `/api/music/choirs/${id}`)).body.members).toHaveLength(0);
    expect(fake.__db.musicChoirMember).toHaveLength(1);
  });
  it("a choir's own leader manages its register and sees only their choirs", async () => {
    const id = await choir('Elim');
    const worship = await choir('Praise', 'WORSHIP');
    // Elim is a system of its own: its President is the one who manages its register.
    fake.__db.position.push({ id: 'pos-elim', personId: 'p-choir-leader', systemId: 'sys-choir-elim', title: 'Choir President', ministryOffice: 'PRESIDENT', grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2021-01-01') });
    const list = (await get('p-choir-leader', '/api/music/choirs')).body;
    expect(list.choirs.map((c: any) => c.name)).toEqual(['Elim']);
    expect(list.canManage).toBe(false);
    expect((await post('p-choir-leader', `/api/music/choirs/${id}/members`, { personId: 'p-member' })).status).toBe(201);
    expect((await get('p-choir-leader', `/api/music/choirs/${worship}`)).status).toBe(404);
  });
});

describe('oversight and menu', () => {
  it('flags choirs without members or without a service this month, and empty services', async () => {
    const elim = await choir('Elim');
    await choir('Quiet');
    await post(MUSIC_LEADER, `/api/music/choirs/${elim}/members`, { personId: 'p-member' });
    const services = [{ id: 'msvc-2026-10-11-SS2', periodKey: '2026-10', date: '2026-10-11', kind: 'SS2', label: 'Sunday Service 2' }, { id: 'msvc-2026-10-18-SS2', periodKey: '2026-10', date: '2026-10-18', kind: 'SS2', label: 'Sunday Service 2' }];
    fake.__db.musicMonth.push({ id: 'mm1', periodKey: '2026-10', state: 'PUBLISHED', version: 1, servicesJson: JSON.stringify(services), assignmentsJson: JSON.stringify([{ id: 'a1', serviceId: services[0].id, unitId: elim, source: 'ENGINE' }]), warningsJson: '[]' });
    const o = (await get(MUSIC_LEADER, '/api/music/oversight?month=2026-10')).body;
    const byName = Object.fromEntries(o.choirs.map((c: any) => [c.name, c]));
    expect(byName.Elim).toMatchObject({ members: 1, services: 1, noMembers: false, notScheduled: false });
    expect(byName.Quiet).toMatchObject({ members: 0, services: 0, noMembers: true, notScheduled: true });
    expect(o.emptyServices).toHaveLength(1);
    expect((await get('p-member', '/api/music/oversight?month=2026-10')).status).toBe(404);
  });
  it('own blocks appear for the Music leader', async () => {
    const caps = await get(MUSIC_LEADER, '/api/me/capabilities');
    const keys = caps.body.systems.find((s: any) => s.id === 'sys-music').own.map((o: any) => o.key);
    expect(keys).toEqual(expect.arrayContaining(['monthplan', 'choirs', 'oversight']));
    const choirKeys = (await get('p-choir-leader', '/api/me/capabilities')).body.systems.find((s: any) => s.id === 'sys-choir').own.map((o: any) => o.key);
    expect(choirKeys).toContain('choirs');
  });
});

describe('editing and deleting a choir', () => {
  it('a choir can be renamed and deleted for good, with its singers; sponsor pledges block the delete', async () => {
    const db = fake.__db;
    for (const k of ['choirSponsor', 'sponsorPledge', 'choirSong', 'choirRehearsal']) db[k] ??= [];
    const id = await choir('Elim', 'PRIMARY');
    await choir('Zion', 'PRIMARY');
    expect((await request(app).patch(`/api/music/choirs/${id}`).set(bearer(MUSIC_LEADER)).send({ name: 'Zion', role: 'PRIMARY' })).body.code).toBe('ALREADY_EXISTS');
    const edit = await request(app).patch(`/api/music/choirs/${id}`).set(bearer(MUSIC_LEADER)).send({ name: 'Elim Choir', role: 'SECONDARY' });
    expect(edit.status).toBe(200);
    expect(db.musicChoir.find((c: any) => c.id === id)).toMatchObject({ name: 'Elim Choir', role: 'SECONDARY' });
    expect((await request(app).patch(`/api/music/choirs/${id}`).set(bearer('p-member')).send({ name: 'X', role: 'PRIMARY' })).status).toBe(403);
    db.musicChoirMember.push({ id: 'm1', choirId: id, personId: 'p-member', status: 'ACTIVE' });
    db.choirSponsor.push({ id: 'sp1', choirId: id, name: 'A' });
    db.sponsorPledge.push({ id: 'pl1', sponsorId: 'sp1', amount: 1000, status: 'PLEDGED' });
    expect((await del(MUSIC_LEADER, `/api/music/choirs/${id}`)).body.code).toBe('HAS_PLEDGES');
    db.sponsorPledge[0].status = 'CANCELLED';
    expect((await del('p-member', `/api/music/choirs/${id}`)).status).toBe(403);
    expect((await del(MUSIC_LEADER, `/api/music/choirs/${id}`)).status).toBe(200);
    expect(db.musicChoir.some((c: any) => c.id === id)).toBe(false);
    expect(db.musicChoirMember.length + db.choirSponsor.length + db.sponsorPledge.length).toBe(0);
    expect(db.musicChoir).toHaveLength(1);
  });
});

describe('Choir register and scheduling draft synchronization', () => {
  const setup = async (status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED', version: number) => {
    const S = await import('../src/scheduling/store');
    const v=await S.createConfigVersion({systemId:'sys-music',version,label:'Rules '+version,status,createdByPersonId:MUSIC_LEADER});
    const primary=await S.createChoirCategory({systemId:'sys-music',code:'PRIMARY',name:'Primary',configVersionId:v.id,createdByPersonId:MUSIC_LEADER});
    const children=await S.createChoirCategory({systemId:'sys-music',code:'CHILDREN',name:'Children',configVersionId:v.id,createdByPersonId:MUSIC_LEADER});
    return {S,v,primary,children};
  };
  it('creates and updates type-based membership in drafts only, preserving exceptions and saved versions', async()=>{
    const active=await setup('ACTIVE',1), draft=await setup('DRAFT',2), archived=await setup('ARCHIVED',3);
    const id=await choir('Register choir','PRIMARY');
    const link=fake.__db.choirCategoryLink.find((row: any)=>row.choirId===id);
    expect(link).toMatchObject({configVersionId:draft.v.id,categoryId:draft.primary.id});
    link.frequencyOverrideJson='{"ss1":{"frequencyTarget":2}}';
    const result=await request(app).patch(`/api/music/choirs/${id}`).set(bearer(MUSIC_LEADER)).send({name:'Renamed register choir',role:'CHILDREN'});
    expect(result.status).toBe(200);
    expect(link).toMatchObject({categoryId:draft.children.id,frequencyOverrideJson:'{"ss1":{"frequencyTarget":2}}'});
    expect(fake.__db.choirCategoryLink.filter((row: any)=>[active.v.id,archived.v.id].includes(row.configVersionId))).toHaveLength(0);
    expect((await get(MUSIC_LEADER,'/api/music/choirs')).body.choirs[0].name).toBe('Renamed register choir');
    expect((await post(MUSIC_LEADER,`/api/music/choirs/${id}/active`,{active:false})).status).toBe(200);
    expect((await get(MUSIC_LEADER,'/api/music/choirs')).body.choirs[0].active).toBe(false);
    expect(fake.__db.choirCategoryLink).toHaveLength(1);
  });
  it('includes registered choirs when cloning an active version without modifying that version',async()=>{
    const {S,v}=await setup('ACTIVE',1);const id=await choir('New register choir');
    const draft=await S.cloneActiveConfigVersion('sys-music',{label:'Draft',createdByPersonId:MUSIC_LEADER});
    expect(fake.__db.choirCategoryLink.filter((row: any)=>row.configVersionId===v.id)).toHaveLength(0);
    const links=fake.__db.choirCategoryLink.filter((row: any)=>row.configVersionId===draft.id);
    expect(links).toHaveLength(1);expect(links[0].choirId).toBe(id);
    expect(fake.__db.choirCategory.find((row: any)=>row.id===links[0].categoryId)).toMatchObject({code:'PRIMARY',configVersionId:draft.id});
  });
  it('does not guess missing categories and maps automatically once a matching category is added',async()=>{
    const S=await import('../src/scheduling/store');const v=await S.createConfigVersion({systemId:'sys-music',version:1,label:'Draft',status:'DRAFT',createdByPersonId:MUSIC_LEADER});
    const id=await choir('Children register choir','CHILDREN');expect(fake.__db.choirCategoryLink ?? []).toHaveLength(0);
    const added=await post(MUSIC_LEADER,'/api/scheduling/config/categories',{systemId:'sys-music',configVersionId:v.id,code:'CHILDREN',name:'Children'});
    expect(added.status).toBe(201);expect(fake.__db.choirCategoryLink).toEqual(expect.arrayContaining([expect.objectContaining({choirId:id,categoryId:added.body.category,configVersionId:v.id})]));
  });
  it('keeps deliberate custom-category choices and refuses deletion of a referenced choir',async()=>{
    const {S,v}=await setup('ACTIVE',1);const id=await choir('Custom choir');
    const category=await S.createChoirCategory({systemId:'sys-music',code:'CUSTOM',name:'Custom',configVersionId:v.id,createdByPersonId:MUSIC_LEADER});
    await S.createChoirCategoryLink({systemId:'sys-music',choirId:id,categoryId:category.id,configVersionId:v.id,createdByPersonId:MUSIC_LEADER});
    const draft=await S.cloneActiveConfigVersion('sys-music',{label:'Draft',createdByPersonId:MUSIC_LEADER});
    const link=fake.__db.choirCategoryLink.find((row: any)=>row.configVersionId===draft.id && row.choirId===id);
    expect(fake.__db.choirCategory.find((row: any)=>row.id===link.categoryId).code).toBe('CUSTOM');
    expect((await del(MUSIC_LEADER,`/api/music/choirs/${id}`)).body.code).toBe('SCHEDULING_HISTORY');
    expect(fake.__db.musicChoir.some((row: any)=>row.id===id)).toBe(true);
    expect((await post(MUSIC_LEADER,`/api/music/choirs/${id}/active`,{active:false})).status).toBe(200);
  });
});
