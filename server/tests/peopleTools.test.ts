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
  for (const k of ['counter', 'auditEvent']) db[k] ??= [];
  db.person.push(
    { id: 'p-aline', fullName: 'Aline Mukamana', status: 'ACTIVE', dateOfBirth: '1990-05-01', phone: '0788111222', memberCode: 'M-00001' },
    { id: 'p-aline2', fullName: 'Mukamana  Aline', status: 'ACTIVE', dateOfBirth: '1990-05-01', phone: '', memberCode: 'M-00002' },
    { id: 'p-sam', fullName: 'Samuel Habimana', status: 'ACTIVE', dateOfBirth: '1985-10-12', joinedChurchOn: '2010-10-10' },
  );
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const post = (who: string, body: object) => request(app).post('/api/people-tools/import').set(bearer(who)).send(body);

describe('CSV import', () => {
  const rows = [
    { fullName: 'New Person', phone: '0788000111', gender: 'FEMALE' },
    { fullName: 'aline mukamana', dateOfBirth: '1990-05-01' },
    { fullName: '', phone: '1' },
    { fullName: 'Bad Date', dateOfBirth: '12/05/1990' },
    { fullName: 'New Person', phone: '0788000111' },
  ];
  it('previews without writing anything', async () => {
    const before = fake.__db.person.length;
    const r = await post('p-pastor', { rows });
    expect(r.status).toBe(200);
    expect(r.body.committed).toBe(false);
    expect(r.body.summary).toEqual({ ok: 1, duplicates: 2, errors: 2 });
    expect(r.body.rows.map((x: any) => x.state)).toEqual(['OK', 'DUPLICATE', 'ERROR', 'ERROR', 'DUPLICATE']);
    expect(fake.__db.person.length).toBe(before);
  });
  it('creates only the clean rows, with member codes, and says so in the audit trail', async () => {
    const before = fake.__db.person.length;
    const r = await post('p-pastor', { rows, commit: true });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(1);
    expect(fake.__db.person.length).toBe(before + 1);
    expect(fake.__db.person.at(-1).memberCode).toMatch(/^M-/);
    expect(fake.__db.auditEvent.at(-1)).toMatchObject({ action: 'PERSON_IMPORT' });
  });
  it('is for people who may add people', async () => {
    expect((await post('p-member', { rows })).status).toBe(403);
    expect((await post('p-choir-leader', { rows })).status).toBe(403);
    expect((await request(app).post('/api/people-tools/import').send({ rows })).status).toBe(401);
    expect((await post('p-pastor', { rows: [] })).status).toBe(400);
  });
});

describe('duplicates and upcoming days', () => {
  it('groups the same name and birth date', async () => {
    const r = await request(app).get('/api/people-tools/duplicates').set(bearer('p-pastor'));
    expect(r.body.total).toBe(1);
    expect(r.body.groups[0].people.map((p: any) => p.id).sort()).toEqual(['p-aline', 'p-aline2']);
    expect((await request(app).get('/api/people-tools/duplicates').set(bearer('p-member'))).status).toBe(403);
  });
  it('finds the next occurrence of a day in church time', async () => {
    const { nextOccurrence } = await import('../src/routes/peopleTools.js');
    const from = new Date('2026-10-08T10:00:00Z');
    expect(nextOccurrence('1985-10-12', from)).toEqual({ day: '2026-10-12', years: 41 });
    expect(nextOccurrence('1985-10-08', from)).toEqual({ day: '2026-10-08', years: 41 });
    expect(nextOccurrence('1985-10-07', from)).toEqual({ day: '2027-10-07', years: 42 });
    expect(nextOccurrence('nope', from)).toBeNull();
  });
  it('lists birthdays for those who see the people module only', async () => {
    const r = await request(app).get('/api/people-tools/upcoming?days=90').set(bearer('p-pastor'));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.events)).toBe(true);
    expect((await request(app).get('/api/people-tools/upcoming').set(bearer('p-member'))).status).toBe(403);
  });
});
