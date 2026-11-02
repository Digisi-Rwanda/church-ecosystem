import request from 'supertest';
import {beforeEach, expect, it, vi} from 'vitest';
import {createFakePrisma} from './fakePrisma';
import {bearer, seedWorld} from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({prisma:fake}));
let app: import('express').Express;
beforeEach(async () => {
  fake.__reset(); seedWorld(fake.__db);
  for (const key of ['orgUnit','personRecord','personDocument','auditEvent','counter','program','delegation']) fake.__db[key] ??= [];
  fake.__db.orgUnit.push({id:'unit-a',systemId:'sys-choir',name:'Choir',kind:'MINISTRY'});
  fake.__db.churchSystem.find((s:any) => s.id === 'sys-choir').orgUnitId='unit-a';
  fake.__db.personRecord.push({id:'foreign-record',personId:'p-youth-member',section:'CONTACT',status:'CURRENT',dataJson:'{"label":"Phone","value":"secret"}'});
  fake.__db.personDocument.push({id:'foreign-file',personId:'p-youth-member',name:'private',dataBase64:'secret'});
  app=(await import('../src/app.js')).createApp();
});
const get=(url:string) => request(app).get(url).set(bearer('p-choir-leader'));
const post=(url:string,body:object) => request(app).post(url).set(bearer('p-choir-leader')).send(body);

it.each(['PRESIDENT','VICE_PRESIDENT','SECRETARY'])('%s records all sections only for own live members', async office => {
  fake.__db.position.find((p:any) => p.id === 'pos-choir').office=office;
  expect((await get('/api/person360/p-choir-member')).body.write).toContain('MARRIAGE');
  for (const [section,data] of [
    ['CONTACT',{label:'Phone',value:'0788000111'}],['EMPLOYMENT',{status:'EMPLOYED',employer:'Example'}],
    ['EDUCATION',{level:'BACHELOR',school:'Example'}],['CALLING',{name:'Singer'}],['FAMILY',{relation:'CHILD',name:'Child'}],
    ['BAPTISM',{date:'2020-01-01'}],['MARRIAGE',{date:'2021-01-01',spouseName:'Spouse'}],
  ] as const) {
    expect((await post('/api/person360/p-choir-member/records',{section,data})).status).toBe(201);
    expect((await post('/api/person360/p-youth-member/records',{section,data})).status).toBe(404);
  }
  expect((await get('/api/person360/p-youth-member')).status).toBe(404);
  expect((await get('/api/person360/records/foreign-record/history')).status).toBe(404);
  expect((await request(app).patch('/api/person360/records/foreign-record').set(bearer('p-choir-leader')).send({data:{label:'X',value:'X'}})).status).toBe(404);
  expect((await get('/api/person360/documents/foreign-file/file')).status).toBe(404);
  expect((await request(app).delete('/api/person360/documents/foreign-file').set(bearer('p-choir-leader'))).status).toBe(404);
  expect((await post('/api/person360/records/foreign-record/void',{reason:'Test'})).status).toBe(404);
  expect((await get('/api/person360/cohorts')).status).toBe(404);
  expect((await post('/api/person360/p-choir-member/records',{section:'FAMILY',data:{relation:'SPOUSE',relatedPersonId:'p-youth-member'}})).status).toBe(400);
  fake.__db.position.find((p:any) => p.id === 'pos-choir').status='ENDED';
  expect((await get('/api/person360/p-choir-member')).status).toBe(404);
});

it.each(['PRESIDENT','VICE_PRESIDENT','SECRETARY'])('%s imports profiles with automatic membership in own system only', async office => {
  fake.__db.position.find((p:any) => p.id === 'pos-choir').office=office;
  const body={systemId:'sys-choir',rows:[{fullName:'New unique unit member',BAPTISM:JSON.stringify({date:'2020-01-01'}),MARRIAGE:JSON.stringify({date:'2021-01-01',spouseName:'Spouse'})}]};
  const before=fake.__db.person.length;
  expect((await post('/api/people-tools/import',body)).body.summary.ok).toBe(1);
  expect(fake.__db.person).toHaveLength(before);
  expect((await post('/api/people-tools/import',{...body,systemId:'sys-youth',commit:true})).status).toBe(403);
  const r=await post('/api/people-tools/import',{...body,commit:true});
  expect(r.status).toBe(201); expect(r.body.created).toBe(1);
  const person=fake.__db.person.at(-1);
  expect(fake.__db.membership).toContainEqual(expect.objectContaining({personId:person.id,systemId:'sys-choir',orgUnitId:'unit-a'}));
  expect(fake.__db.personRecord.filter((r:any) => r.personId === person.id)).toHaveLength(2);
  expect((await get(`/api/person360/${person.id}`)).status).toBe(200);
});

it('rejects invalid section data before creating any person or membership', async () => {
  const before=fake.__db.person.length;
  const r=await post('/api/people-tools/import',{systemId:'sys-choir',commit:true,rows:[{fullName:'Bad profile',BAPTISM:'{"date":"bad"}'}]});
  expect(r.body.summary.errors).toBe(1); expect(r.body.created).toBe(0);
  expect(fake.__db.person).toHaveLength(before);
});

it('combines unit and church section rights without extending unit marriage rights church-wide', async () => {
  fake.__db.position.push({id:'church-secretary',personId:'p-choir-leader',systemId:'sys-main',office:'CHURCH_SECRETARY',status:'ACTIVE',startDate:new Date('2020-01-01')});
  expect((await post('/api/person360/p-choir-member/records',{section:'MARRIAGE',data:{date:'2020-01-01',spouseName:'Spouse'}})).status).toBe(201);
  expect((await post('/api/person360/p-youth-member/records',{section:'MARRIAGE',data:{date:'2020-01-01',spouseName:'Spouse'}})).status).toBe(404);
});

it('requires live membership and checks import authorization again on commit', async () => {
  fake.__db.membership.find((m:any) => m.personId === 'p-choir-member' && m.systemId === 'sys-choir').status='ENDED';
  expect((await get('/api/person360/p-choir-member')).status).toBe(404);
  const body={systemId:'sys-choir',rows:[{fullName:'Preview only person'}]};
  expect((await post('/api/people-tools/import',body)).status).toBe(200);
  fake.__db.position.find((p:any) => p.id === 'pos-choir').endDate=new Date('2020-01-01');
  expect((await post('/api/people-tools/import',{...body,commit:true})).status).toBe(403);
});

it('permits basic changes only for own people and does not disclose foreign duplicate details', async () => {
  const own=await request(app).patch('/api/people/p-choir-member').set(bearer('p-choir-leader')).send({phone:'0788999888'});
  expect(own.status).toBe(200);
  const other=await request(app).patch('/api/people/p-youth-member').set(bearer('p-choir-leader')).send({phone:'0788999888'});
  expect(other.status).toBe(403);
  const duplicate=await post('/api/people-tools/import',{systemId:'sys-choir',rows:[{fullName:'p-youth-member'}]});
  expect(duplicate.body.rows[0].state).toBe('DUPLICATE');
  expect(duplicate.body.rows[0].matches).toBeUndefined();
  expect((await get('/api/people-tools/duplicates')).status).toBe(403);
});
