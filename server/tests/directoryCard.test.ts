import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'systemSetting']) db[k] ??= [];
  db.person.push({ id: 'p-ctreas', fullName: 'Choir Treasurer', status: 'ACTIVE' });
  db.position.push({ id: 'pos-ct', personId: 'p-ctreas', systemId: 'sys-choir', title: 'Treasurer', office: 'TREASURER', status: 'ACTIVE', startDate: new Date('2022-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});
describe('a unit treasurer and the directory', () => {
  it('lists the unit and opens a member as a names-only card', async () => {
    const list = await request(app).get('/api/people?systemId=sys-choir').set(bearer('p-ctreas'));
    expect(list.status).toBe(200);
    const card = await request(app).get('/api/people/p-choir-member').set(bearer('p-ctreas'));
    expect(card.status).toBe(200);
    expect(card.body.tier).toBe('DIRECTORY');
    expect(card.body.person.fullName).toBe('p-choir-member');
    expect(card.body.person.phone).toBeUndefined();
  });
  it('still refuses someone outside the unit', async () => {
    const card = await request(app).get('/api/people/p-outsider').set(bearer('p-ctreas'));
    expect(card.status).toBe(403);
  });
  it('finds people whatever the capitals', async () => {
    const r = await request(app).get('/api/people?systemId=sys-choir&q=CHOIR TREAS').set(bearer('p-ctreas'));
    expect(r.body.people.map((p: { id: string }) => p.id)).toContain('p-ctreas');
  });
});
