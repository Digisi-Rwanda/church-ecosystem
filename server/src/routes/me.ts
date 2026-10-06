import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { buildEffectiveAccess, grantsForSystem } from '../policy/evaluate.js';
import { loadPolicyContext } from '../policy/loadContext.js';
import type { Position } from '../policy/types.js';
import { blocksForSystem } from '../capabilities/letters.js';
import { SHARED_BLOCKS, type OfficeCode } from '../shared/vocabulary.js';

export const meRouter = Router();
export const portalRouter = Router();

const isLive = (p: { status: string; startDate: string; endDate?: string }, now: Date) =>
  p.status === 'ACTIVE' &&
  new Date(p.startDate) <= now &&
  (!p.endDate || new Date(p.endDate) >= now);

const SYSTEM_ROLE_TO_OFFICE: Record<string, OfficeCode> = {
  CHURCH_LEADER: 'CHURCH_LEADER',
  PASTOR: 'CHURCH_LEADER',
  CATECHIST: 'CATECHIST',
  CHURCH_SECRETARY: 'CHURCH_SECRETARY',
};
const MINISTRY_OFFICE_TO_OFFICE: Record<string, OfficeCode> = {
  PRESIDENT: 'PRESIDENT',
  VP: 'VICE_PRESIDENT',
  SECRETARY: 'SECRETARY',
  TREASURER: 'TREASURER',
  COORDINATOR: 'COORDINATOR',
};

function officeCodeOf(p: Position): OfficeCode | null {
  if (p.systemRole && SYSTEM_ROLE_TO_OFFICE[p.systemRole]) return SYSTEM_ROLE_TO_OFFICE[p.systemRole];
  const raw = p.ministryOffice ?? p.choirOffice ?? p.worshipOffice ?? p.protocolOffice ?? p.deaconOffice;
  return raw ? (MINISTRY_OFFICE_TO_OFFICE[raw] ?? null) : null;
}

/** Everything the server knows about this person's standing, computed once per request. */
async function standing(personId: string) {
  const now = new Date();
  const ctx = await loadPolicyContext();
  const grants = buildEffectiveAccess(personId, ctx, now);
  const positions = ctx.positions.filter((p) => p.personId === personId && isLive(p, now));
  const memberships = ctx.memberships.filter((m) => m.personId === personId && isLive(m, now));
  const systems = await prisma.churchSystem.findMany({ orderBy: { code: 'asc' } });
  // The shared Finance system is being retired; it is never a place a person enters.
  const enterable = systems.filter(
    (s) =>
      (s.kind ?? 'MINISTRY') !== 'SHARED' &&
      grants.some((g) => g.systemId === s.id && g.resource === 'SYSTEM' && g.action === 'ENTER'),
  );
  return { grants, positions, memberships, enterable };
}

function roleLabel(
  systemId: string,
  positions: Position[],
  memberships: { systemId?: string; label: string }[],
): string {
  const own = positions.find((p) => p.systemId === systemId);
  if (own) return own.title;
  const governing = positions.find((p) => p.grantsAllSystems);
  if (governing) return governing.title;
  const member = memberships.find((m) => m.systemId === systemId);
  return member?.label ?? 'Member';
}

/** The portal: one card per system this person may enter. */
portalRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const s = await standing(req.auth!.personId);
  res.json({
    systems: s.enterable.map((sys) => ({
      id: sys.id,
      code: sys.code,
      name: sys.name ?? sys.id,
      shortName: sys.shortName ?? sys.name ?? sys.id,
      basePath: sys.basePath,
      role: roleLabel(sys.id, s.positions, s.memberships),
      // Notifications arrive in slice 1.4; until then nothing is unread.
      unreadCount: 0,
    })),
  });
});

/** What this person may do, so the app can show or hide screens. The server checks again on every call. */
meRouter.get('/capabilities', requireAuth, async (req: AuthedRequest, res) => {
  const s = await standing(req.auth!.personId);
  res.json({
    personId: req.auth!.personId,
    offices: s.positions
      .map((p) => ({
        id: p.id,
        systemId: p.systemId ?? null,
        title: p.title,
        code: officeCodeOf(p),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    systems: s.enterable.map((sys) => ({
      id: sys.id,
      blocks: blocksForSystem(grantsForSystem(s.grants, sys.id)),
    })),
    blockOrder: SHARED_BLOCKS,
  });
});
