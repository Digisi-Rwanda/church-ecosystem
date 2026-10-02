/**
 * SPA <-> server program lifecycle parity.
 *
 * The program life cycle (submit, approve, start, pause, close) is implemented
 * twice: in the SPA's missionService (browser data) and in the server's
 * mission/lifecycle (database). For every starting status and every
 * operation, both must agree on whether it is allowed and where it ends up.
 */
import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
vi.stubGlobal('window', { setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, addEventListener: () => {} });
vi.stubGlobal('localStorage', (globalThis as any).window.localStorage);

// Loaded after the stubs above (static imports would be hoisted before them).
const { missionService: spa } = await import('../../src/services/missionService');
const { PROGRAMS } = await import('../../src/data/seed');
const server = await import('../src/mission/lifecycle');

const STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'SETUP', 'ACTIVE', 'PAUSED', 'CLOSING', 'ENDED'];
const LEADER = { person: 'p-pastor', roles: ['CHURCH_LEADER'] };
const NOBODY = { person: 'p-member', roles: ['MEMBER'] };

type Outcome = { ok: boolean; status: string };

const ops: Array<{
  name: string;
  spa: (id: string, who: typeof LEADER) => boolean;
  srv: (id: string, who: typeof LEADER) => Promise<boolean>;
}> = [
  { name: 'submit', spa: (id) => !!spa.submitProgramForApproval(id).ok, srv: async (id) => (await server.submitProgram(id)).ok },
  { name: 'approve (leader)', spa: (id) => !!spa.approveProgram(id, LEADER.person, LEADER.roles as any).ok, srv: async (id) => (await server.approveProgram(id, LEADER.person)).ok },
  { name: 'approve (ordinary member)', spa: (id) => !!spa.approveProgram(id, NOBODY.person, NOBODY.roles as any).ok, srv: async (id) => (await server.approveProgram(id, NOBODY.person)).ok },
  { name: 'start', spa: (id) => !!spa.startProgram(id).ok, srv: async (id) => (await server.startProgram(id)).ok },
  { name: 'pause', spa: (id) => !!spa.pauseProgram(id), srv: async (id) => (await server.pauseProgram(id)).ok },
  { name: 'begin close', spa: (id) => !!spa.beginCloseProgram(id).ok, srv: async (id) => (await server.beginCloseProgram(id)).ok },
  { name: 'abandon close', spa: (id) => !!spa.abandonCloseProgram(id).ok, srv: async (id) => (await server.abandonCloseProgram(id)).ok },
];

async function runBoth(op: (typeof ops)[number], from: string): Promise<{ spa: Outcome; srv: Outcome }> {
  const id = `prog-${op.name}-${from}`.replace(/[^a-z0-9-]/gi, '_');
  PROGRAMS.push({ id, name: id, ownerSystemId: 'sys-choir', status: from, visibility: 'MINISTRY_PRIVATE' } as any);
  fake.__db.program.push({ id, name: id, ownerSystemId: 'sys-choir', status: from, visibility: 'MINISTRY_PRIVATE', stewardshipJson: null, createdAt: new Date(), updatedAt: new Date() });
  const spaOk = op.spa(id, LEADER);
  const srvOk = await op.srv(id, LEADER);
  return {
    spa: { ok: spaOk, status: (PROGRAMS.find((p) => p.id === id) as any).status },
    srv: { ok: srvOk, status: fake.__db.program.find((p: any) => p.id === id).status },
  };
}

describe('program lifecycle: SPA and server agree on every transition', () => {
  seedWorld(fake.__db);
  for (const op of ops) {
    for (const from of STATUSES) {
      it(`${op.name} from ${from}`, async () => {
        const r = await runBoth(op, from);
        expect(r.spa).toEqual(r.srv);
      });
    }
  }
});
