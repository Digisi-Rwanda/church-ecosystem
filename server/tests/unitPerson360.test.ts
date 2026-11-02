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

const fullProfile = [
  {section:'CONTACT',data:{label:'Emergency contact',value:'Relative phone'}},
  {section:'EMPLOYMENT',data:{status:'EMPLOYED',sector:'EDUCATION',employer:'School',role:'Teacher',since:'2019-01-01'}},
  {section:'EDUCATION',data:{level:'BACHELOR',school:'University',field:'Education',startYear:2010,endYear:2014}},
  {section:'CALLING',data:{name:'Singer',since:'2020-01-01'}},
  {section:'FAMILY',data:{relation:'CHILD',name:'Child',dateOfBirth:'2022-01-01',gender:'FEMALE'}},
  {section:'BAPTISM',data:{date:'2010-01-01',place:'Church',baptisedBy:'Minister'}},
  {section:'MARRIAGE',data:{date:'2020-01-01',spouseName:'Spouse',certificateRef:'REF-1'}},
];

it.each(['PRESIDENT','VICE_PRESIDENT','SECRETARY'])('%s registers a complete profile in own system', async office=>{
  fake.__db.position.find((p:any)=>p.id==='pos-choir').office=office;
  const options=await get('/api/people/registration-options?systemId=sys-choir');
  expect(options.status).toBe(200); expect(options.body.write).toHaveLength(7);
  expect((await get('/api/people/registration-options?systemId=sys-youth')).status).toBe(403);
  const result=await post('/api/people',{fullName:'Complete new profile',preferredName:'Complete',gender:'FEMALE',status:'VISITOR',address:'Kigali',joinedChurchOn:'2026-01-01',systemId:'sys-choir',records:fullProfile});
  expect(result.status).toBe(201);
  const id=result.body.person.id;
  expect(fake.__db.membership).toContainEqual(expect.objectContaining({personId:id,systemId:'sys-choir',orgUnitId:'unit-a'}));
  expect(fake.__db.personRecord.filter((record:any)=>record.personId===id)).toHaveLength(7);
  expect((await get('/api/person360/'+id)).body.records).toHaveLength(7);
  expect((await post('/api/people',{fullName:'Wrong system',systemId:'sys-youth',records:fullProfile})).status).toBe(403);
});

it('rejects unfinished, duplicate-singleton and cross-person registration records before saving', async()=>{
  const before=fake.__db.person.length;
  for (const records of [
    [{section:'BAPTISM',data:{date:'bad'}}],
    [fullProfile[5],fullProfile[5]],
    [{section:'FAMILY',data:{relation:'SPOUSE',relatedPersonId:'p-youth-member'}}],
    [{section:'CALLING',data:{name:'Singer',orgUnitId:'foreign-unit'}}],
  ]) {
    expect((await post('/api/people',{fullName:'Invalid profile',systemId:'sys-choir',records})).status).toBe(400);
    expect(fake.__db.person).toHaveLength(before);
  }
});

it('keeps church-wide section restrictions and rechecks expired unit offices at registration',async()=>{
  fake.__db.position.push({id:'church-registration-secretary',personId:'p-member',systemId:'sys-main',office:'CHURCH_SECRETARY',status:'ACTIVE',startDate:new Date('2020-01-01')});
  const options=await request(app).get('/api/people/registration-options?systemId=sys-main').set(bearer('p-member'));
  expect(options.body.write).toContain('EDUCATION'); expect(options.body.write).not.toContain('MARRIAGE');
  const before=fake.__db.person.length;
  const rejected=await request(app).post('/api/people').set(bearer('p-member')).send({fullName:'Unauthorized church marriage',records:[fullProfile[6]]});
  expect(rejected.status).toBe(400); expect(fake.__db.person).toHaveLength(before);
  fake.__db.position.find((p:any)=>p.id==='pos-choir').endDate=new Date('2020-01-01');
  expect((await post('/api/people',{fullName:'Expired authority',systemId:'sys-choir',records:fullProfile})).status).toBe(403);
});

it('imports all seven sections from flat spreadsheet columns, retaining repeatable JSON records',async()=>{
  const row:Record<string,unknown>={fullName:'Flat complete profile',preferredName:'Flat',nationalId:'1234567890123456'};
  for(const record of fullProfile) for(const [key,value] of Object.entries(record.data)) row[record.section+'.'+key]=String(value);
  row.CONTACT=JSON.stringify([{label:'Other',value:'Another contact'}]);
  const preview=await post('/api/people-tools/import',{systemId:'sys-choir',rows:[row]});
  expect(preview.body.summary).toEqual({ok:1,duplicates:0,errors:0});
  const result=await post('/api/people-tools/import',{systemId:'sys-choir',rows:[row],commit:true});
  expect(result.status).toBe(201); expect(result.body.created).toBe(1);
  const person=fake.__db.person.at(-1);
  expect(person.preferredName).toBe('Flat'); expect(person.nationalId).toBe(row.nationalId);
  const records=fake.__db.personRecord.filter((record:any)=>record.personId===person.id);
  expect(records).toHaveLength(8);
  expect(JSON.parse(records.find((record:any)=>record.section==='EDUCATION').dataJson).endYear).toBe(2014);
  const duplicate=await post('/api/people-tools/import',{systemId:'sys-choir',rows:[{fullName:'Different name',nationalId:row.nationalId}],commit:true});
  expect(duplicate.body.summary.duplicates).toBe(1); expect(duplicate.body.created).toBe(0);
});

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
