import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filterForReader, restoreHidden } from '../src/policy/scheduleVisibility';
import type { GuardActor } from '../src/policy/scheduleGuard';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

const grant = (systemId: string, action = 'VIEW', resource = 'MEMBERSHIP') =>
  ({ systemId, resource, action, source: 'T', reason: 't' }) as GuardActor['grants'][number];
const nobody: GuardActor = { personId: 'p-x', grants: [], positions: [] };
const musicMgr: GuardActor = { personId: 'p-m', grants: [grant('sys-music', 'MANAGE')], positions: [] };
const protoMember: GuardActor = { personId: 'p-a', grants: [grant('sys-protocol')], positions: [] };
const treasurer: GuardActor = {
  personId: 'p-t',
  grants: [grant('sys-protocol')],
  positions: [
    { personId: 'p-t', systemId: 'sys-protocol', status: 'ACTIVE', protocolOffice: 'TREASURER' } as never,
  ],
};

const music = {
  musicSchedule: {
    drafts: [{ id: 'd1' }],
    confirmed: [{ id: 'c1' }],
    log: [{ id: 'l1' }],
    published: [{ id: 'pub1' }],
    notifs: [
      { id: 'n1', personId: 'p-x' },
      { id: 'n2', personId: 'p-m' },
    ],
  },
};
const proto = {
  protocolRoster: [{ id: 'r1' }],
  protocolNotifications: [
    { id: 'a', personId: 'p-a' },
    { id: 'b', personId: 'p-t' },
  ],
  protocolContributions: [
    { id: 'k1', personId: 'p-a', amount: 1 },
    { id: 'k2', personId: 'p-q', amount: 2 },
  ],
};

describe('read filter', () => {
  it('hides unpublished Music from people without Music rights', () => {
    const v: any = filterForReader('music', music, nobody);
    expect(v.musicSchedule.drafts).toEqual([]);
    expect(v.musicSchedule.confirmed).toEqual([]);
    expect(v.musicSchedule.log).toEqual([]);
    expect(v.musicSchedule.published).toHaveLength(1);
    expect(v.musicSchedule.notifs.map((n: any) => n.id)).toEqual(['n1']);
  });
  it('Protocol participants see confirmed months (they build from them), not drafts', () => {
    const v: any = filterForReader('music', music, protoMember);
    expect(v.musicSchedule.drafts).toEqual([]);
    expect(v.musicSchedule.confirmed).toHaveLength(1);
    expect(v.musicSchedule.log).toHaveLength(1);
  });
  it('Music managers see drafts', () => {
    const v: any = filterForReader('music', music, musicMgr);
    expect(v.musicSchedule.drafts).toHaveLength(1);
  });
  it('Protocol: own notifications; contributions to staff only', () => {
    const m: any = filterForReader('protocol', proto, protoMember);
    expect(m.protocolNotifications.map((n: any) => n.id)).toEqual(['a']);
    expect(m.protocolContributions.map((c: any) => c.id)).toEqual(['k1']);
    expect(m.protocolRoster).toHaveLength(1);
    const t: any = filterForReader('protocol', proto, treasurer);
    expect(t.protocolContributions).toHaveLength(2);
  });
});

describe('restoreHidden: reading less never deletes data', () => {
  it('a save from a person who saw less keeps the rest', () => {
    const seen = filterForReader('music', music, nobody) as any;
    seen.musicSchedule.notifs.push({ id: 'n3', personId: 'p-m' }); // notify someone else
    const saved: any = restoreHidden('music', music, seen, nobody);
    expect(saved.musicSchedule.drafts).toHaveLength(1);
    expect(saved.musicSchedule.confirmed).toHaveLength(1);
    expect(saved.musicSchedule.notifs.map((n: any) => n.id).sort()).toEqual(['n1', 'n2', 'n3']);
  });
  it('cannot edit a row they could not see', () => {
    const forged: any = filterForReader('protocol', proto, protoMember);
    forged.protocolContributions.push({ id: 'k2', personId: 'p-q', amount: 999 });
    const saved: any = restoreHidden('protocol', proto, forged, protoMember);
    expect(saved.protocolContributions.find((c: any) => c.id === 'k2').amount).toBe(2);
  });
  it('their own rows can still change or go', () => {
    const seen: any = filterForReader('protocol', proto, protoMember);
    seen.protocolNotifications = []; // cleared their own inbox
    const saved: any = restoreHidden('protocol', proto, seen, protoMember);
    expect(saved.protocolNotifications.map((n: any) => n.id)).toEqual(['b']);
  });
});

describe('over HTTP', () => {
  beforeEach(() => {
    fake.__reset();
    seedWorld(fake.__db);
    delete process.env.SCHEDULE_GUARD;
    process.env.SCHEDULE_READ_FILTER = 'on';
  });
  const app = async () => (await import('../src/app.js')).createApp();

  it('a member never receives drafts, and saving does not wipe them', async () => {
    const a = await app();
    const doc = { musicSchedule: { drafts: [{ id: 'd1' }], published: [], confirmed: [], notifs: [] } };
    await request(a).put('/api/schedule-state/music').set(bearer('p-pastor')).send({ baseVersion: 0, data: doc });
    const seen = await request(a).get('/api/schedule-state/music').set(bearer('p-outsider'));
    expect(seen.body.data.musicSchedule.drafts).toEqual([]);
    // the outsider saves what they saw (no drafts)
    await request(a)
      .put('/api/schedule-state/music')
      .set(bearer('p-outsider'))
      .send({ baseVersion: 1, data: seen.body.data });
    const boss = await request(a).get('/api/schedule-state/music').set(bearer('p-pastor'));
    expect(boss.body.data.musicSchedule.drafts).toEqual([{ id: 'd1' }]);
  });

  it('the filter is off unless switched on, and then sends everything', async () => {
    delete process.env.SCHEDULE_READ_FILTER;
    const a = await app();
    const doc = { musicSchedule: { drafts: [{ id: 'd1' }] } };
    await request(a).put('/api/schedule-state/music').set(bearer('p-pastor')).send({ baseVersion: 0, data: doc });
    const seen = await request(a).get('/api/schedule-state/music').set(bearer('p-outsider'));
    expect(seen.body.data.musicSchedule.drafts).toHaveLength(1);
  });
});
