import { beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createFakePrisma } from './fakePrisma';
import { firstChiefAdministrator } from '../src/lib/firstChiefAdministrator';

let fake: ReturnType<typeof createFakePrisma>;
beforeEach(() => {
  fake = createFakePrisma();
  for (const key of ['person','account','position','orgUnit','churchSystem','auditEvent']) fake.__db[key] ??= [];
  fake.__db.person.push({id:'operator',fullName:'Designated operator',status:'ACTIVE',archivedAt:null});
  fake.__db.account.push({id:'account',personId:'operator',username:'operator',passwordHash:'unchanged'});
  fake.__db.orgUnit.push({id:'media',name:'Media',kind:'TEAM',systemId:'sys-media'});
  fake.__db.churchSystem.push({id:'sys-media',orgUnitId:'media'});
});
const run = (input: Parameters<typeof firstChiefAdministrator>[1]) => firstChiefAdministrator(fake as unknown as PrismaClient,input);
it('defaults to a read-only identity plan', async () => {
  expect(await run({username:'operator'})).toMatchObject({applied:false,personId:'operator'});
  expect(fake.__db.position).toHaveLength(0);
  expect(fake.__db.auditEvent).toHaveLength(0);
});
it('requires the exact dry-run identity before granting the role', async () => {
  await expect(run({username:'operator',apply:true,expectedPersonId:'someone-else'})).rejects.toThrow('exact person ID');
  expect(fake.__db.position).toHaveLength(0);
});
it('grants only the first chief role and audits it without changing the account', async () => {
  expect(await run({username:'operator',apply:true,expectedPersonId:'operator'})).toMatchObject({applied:true});
  expect(fake.__db.position[0]).toMatchObject({office:'ADMINISTRATOR',personId:'operator',systemId:'sys-media',grantsAllSystems:false});
  expect(fake.__db.auditEvent[0].action).toBe('FIRST_CHIEF_ADMINISTRATOR_BOOTSTRAPPED');
  expect(fake.__db.account[0].passwordHash).toBe('unchanged');
  await expect(run({username:'operator',apply:true,expectedPersonId:'operator'})).rejects.toThrow('already exists');
  expect(fake.__db.position).toHaveLength(1);
});
it('rejects missing accounts, inactive people and missing system links', async () => {
  await expect(run({username:'unknown'})).rejects.toThrow('No account');
  fake.__db.person[0].status='INACTIVE';
  await expect(run({username:'operator'})).rejects.toThrow('active');
  fake.__db.person[0].status='ACTIVE';
  fake.__db.churchSystem[0].orgUnitId=null;
  await expect(run({username:'operator'})).rejects.toThrow('valid organizational unit');
});
it('allows repeat seeds only for the exact existing live holder without more writes', async () => {
  await run({username:'operator',apply:true,expectedPersonId:'operator'});
  expect(await run({username:'operator',apply:true,expectedPersonId:'operator',allowExisting:true})).toMatchObject({applied:false,alreadyExists:true});
  expect(fake.__db.position).toHaveLength(1);
  expect(fake.__db.auditEvent).toHaveLength(1);
  await expect(run({username:'operator',apply:true,expectedPersonId:'wrong',allowExisting:true})).rejects.toThrow('already exists');
  fake.__db.position[0].status='ENDED';
  await expect(run({username:'operator',apply:true,expectedPersonId:'operator',allowExisting:true})).rejects.toThrow('already exists');
});
