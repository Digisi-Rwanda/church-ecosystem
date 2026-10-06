import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import {
  ACCESS_LETTERS,
  MODULE_LETTERS,
  SHARED_BLOCKS,
  BLOCK_MODULE,
  formatMemberCode,
  MEMBER_CODE_PATTERN,
} from '../src/shared/vocabulary';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

let app: import('express').Express;
beforeEach(async () => {
  fake.__reset();
  seedWorld(fake.__db);
  for (const s of fake.__db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.kind = s.id === 'sys-main' ? 'MAIN' : s.id === 'sys-finance' ? 'SHARED' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('shared vocabulary', () => {
  it('every module letter is a known letter, and every block has a module', () => {
    for (const letters of Object.values(MODULE_LETTERS)) {
      for (const l of letters) expect(ACCESS_LETTERS).toContain(l);
    }
    expect(SHARED_BLOCKS).toHaveLength(6);
    for (const b of SHARED_BLOCKS) expect(MODULE_LETTERS).toHaveProperty(BLOCK_MODULE[b]);
  });
  it('member codes grow from five digits and match the pattern', () => {
    expect(formatMemberCode(123)).toBe('M-00123');
    expect(formatMemberCode(1234567)).toBe('M-1234567');
    expect(MEMBER_CODE_PATTERN.test(formatMemberCode(7))).toBe(true);
  });
});

describe('GET /api/portal', () => {
  it('needs sign-in', async () => {
    expect((await request(app).get('/api/portal')).status).toBe(401);
  });
  it('a plain member sees only the main church card, with the member role', async () => {
    const r = await request(app).get('/api/portal').set(bearer('p-member'));
    expect(r.status).toBe(200);
    expect(r.body.systems.map((s: any) => s.id)).toEqual(['sys-main']);
    expect(r.body.systems[0].role).toBe('Church member');
    expect(r.body.systems[0].unreadCount).toBe(0);
  });
  it('a choir leader sees the choir with their own title', async () => {
    const r = await request(app).get('/api/portal').set(bearer('p-choir-leader'));
    const choir = r.body.systems.find((s: any) => s.id === 'sys-choir');
    expect(choir?.role).toBe('Choir Leader');
    expect(r.body.systems.find((s: any) => s.id === 'sys-youth')).toBeUndefined();
  });
  it('the Church Leader enters every system except the retired shared Finance', async () => {
    const r = await request(app).get('/api/portal').set(bearer('p-pastor'));
    const ids = r.body.systems.map((s: any) => s.id);
    expect(ids).toContain('sys-youth');
    expect(ids).toContain('sys-deacon');
    expect(ids).not.toContain('sys-finance');
  });
  it('a person with no membership still gets the main church and nothing else', async () => {
    const r = await request(app).get('/api/portal').set(bearer('p-outsider'));
    expect(r.body.systems.map((s: any) => s.id)).toEqual(['sys-main']);
    expect(r.body.systems[0].role).toBe('Member');
  });
});

describe('GET /api/me/capabilities', () => {
  it('needs sign-in', async () => {
    expect((await request(app).get('/api/me/capabilities')).status).toBe(401);
  });
  it('returns the six blocks in order for every system, and only letters the module allows', async () => {
    const r = await request(app).get('/api/me/capabilities').set(bearer('p-pastor'));
    expect(r.status).toBe(200);
    expect(r.body.blockOrder).toEqual([...SHARED_BLOCKS]);
    for (const sys of r.body.systems) {
      expect(Object.keys(sys.blocks)).toEqual([...SHARED_BLOCKS]);
      for (const b of SHARED_BLOCKS) {
        for (const l of sys.blocks[b]) expect(MODULE_LETTERS[BLOCK_MODULE[b]]).toContain(l);
      }
    }
  });
  it('a member can read at home but write nowhere', async () => {
    const r = await request(app).get('/api/me/capabilities').set(bearer('p-member'));
    const main = r.body.systems.find((s: any) => s.id === 'sys-main');
    expect(main.blocks.home).toEqual(['R']);
    for (const b of SHARED_BLOCKS) expect(main.blocks[b]).not.toContain('W');
  });
  it('a ministry president writes in their own system and not in another', async () => {
    const r = await request(app).get('/api/me/capabilities').set(bearer('p-choir-leader'));
    const choir = r.body.systems.find((s: any) => s.id === 'sys-choir');
    expect(choir.blocks.work).toContain('W');
    expect(r.body.systems.find((s: any) => s.id === 'sys-youth')).toBeUndefined();
  });
  it('lists the offices the person holds, with an office code', async () => {
    const r = await request(app).get('/api/me/capabilities').set(bearer('p-pastor'));
    expect(r.body.offices).toEqual([
      expect.objectContaining({ title: 'Senior Pastor', code: 'CHURCH_LEADER' }),
    ]);
  });
  it('ending an office removes the access at once', async () => {
    const pos = fake.__db.position.find((p: any) => p.id === 'pos-choir');
    pos.endDate = new Date('2022-01-01');
    const r = await request(app).get('/api/me/capabilities').set(bearer('p-choir-leader'));
    expect(r.body.systems.find((s: any) => s.id === 'sys-choir')).toBeUndefined();
    expect(r.body.offices).toEqual([]);
  });
});
