import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { buildEffectiveAccess } from '../policy/evaluate.js';
import { loadPolicyContext } from '../policy/loadContext.js';
import type { Position } from '../policy/types.js';
import { blocksFromModules } from '../capabilities/letters.js';
import { liveHoldings, lettersInSystem, type AccessData } from '../capabilities/engine.js';
import { officeOf } from '../lib/offices.js';
import { SHARED_BLOCKS } from '../shared/vocabulary.js';

export const meRouter = Router();
export const portalRouter = Router();

const isLive = (p: { status: string; startDate: string; endDate?: string }, now: Date) =>
  p.status === 'ACTIVE' &&
  new Date(p.startDate) <= now &&
  (!p.endDate || new Date(p.endDate) >= now);

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
  const access: AccessData = {
    positions: ctx.positions,
    memberships: ctx.memberships,
    delegations: await prisma.delegation.findMany({ where: { toPersonId: personId } }),
  };
  return { grants, positions, memberships, enterable, access };
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
  const holdings = liveHoldings(req.auth!.personId, s.access, new Date());
  res.json({
    personId: req.auth!.personId,
    offices: s.positions
      .map((p) => ({
        id: p.id,
        systemId: p.systemId ?? null,
        title: p.title,
        code: officeOf(p),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    systems: s.enterable.map((sys) => ({
      id: sys.id,
      blocks: blocksFromModules(lettersInSystem(req.auth!.personId, sys.id, s.access, new Date(), holdings)),
    })),
    blockOrder: SHARED_BLOCKS,
  });
});
