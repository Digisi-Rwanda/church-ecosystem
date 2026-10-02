import express, { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { buildEffectiveAccess } from '../policy/buildAccess.js';
import { loadPolicyContext } from '../policy/loadContext.js';
import { checkScheduleChange, type GuardActor } from '../policy/scheduleGuard.js';
import { filterForReader, readFilterEnabled, restoreHidden } from '../policy/scheduleVisibility.js';
import {
  pathParam,
  requireAuth,
  type AuthedRequest,
} from '../middleware/http.js';

/**
 * Shared state for the Music scheduling and Protocol modules.
 *
 * Each module's state is one JSON document. Clients load it after sign-in and
 * save it back with the version they started from; a save based on an older
 * version is refused (409) so two people never silently overwrite each other.
 *
 * Role rules (who may confirm, publish, review…) are applied by the client
 * services and, on the server, by policy/scheduleGuard.ts, which compares the
 * saved and the new document row by row. SCHEDULE_GUARD selects the mode:
 *   off      no check;
 *   warn     (default) log violations and flag the response, still save;
 *   enforce  refuse the save with 403.
 * Use `enforce` once the people who hold each office exist as server
 * Positions; demo role accounts have none and would be refused.
 * Reads are filtered too (policy/scheduleVisibility.ts, SCHEDULE_READ_FILTER=on
 * for a real launch): unpublished Music drafts and other people's notifications and
 * contributions are not sent, and a save puts back what the person never saw.
 * The server also records who saved each version and keeps recent revisions.
 */
export type GuardMode = 'off' | 'warn' | 'enforce';
export function guardMode(): GuardMode {
  const v = (process.env.SCHEDULE_GUARD ?? 'warn').toLowerCase();
  return v === 'off' || v === 'enforce' ? v : 'warn';
}
export const scheduleStateRouter = Router();

/** The signed-in person as the guard and the read filter see them. */
async function actorFor(personId: string): Promise<GuardActor> {
  const ctx = await loadPolicyContext();
  return { personId, grants: buildEffectiveAccess(personId, ctx), positions: ctx.positions };
}

export const SCHEDULE_KEYS = ['music', 'protocol'] as const;
type ScheduleKey = (typeof SCHEDULE_KEYS)[number];
const KEEP_REVISIONS = 40;

function keyOf(req: express.Request): ScheduleKey | null {
  const k = pathParam(req, 'key');
  return SCHEDULE_KEYS.includes(k as ScheduleKey) ? (k as ScheduleKey) : null;
}

// These documents are bigger than the 1 MB default used elsewhere.
scheduleStateRouter.use(express.json({ limit: '12mb' }));

scheduleStateRouter.get('/:key', requireAuth, async (req: AuthedRequest, res) => {
  const key = keyOf(req);
  if (!key) {
    res.status(404).json({ error: 'Unknown schedule document' });
    return;
  }
  const row = await prisma.scheduleDocument.findUnique({ where: { key } });
  if (!row) {
    res.json({ key, version: 0, updatedAt: null, updatedByPersonId: null, data: null });
    return;
  }
  let data: unknown = JSON.parse(row.data);
  if (readFilterEnabled()) {
    try {
      data = filterForReader(key, data, await actorFor(req.auth!.personId));
    } catch (e) {
      // Never fall back to sending everything when the check cannot run.
      console.warn('[scheduleVisibility] could not evaluate:', e);
      res.status(503).json({ error: 'Could not check permissions' });
      return;
    }
  }
  res.json({
    key,
    version: row.version,
    updatedAt: row.updatedAt,
    updatedByPersonId: row.updatedByPersonId ?? null,
    data,
  });
});

/** Cheap poll: has anything changed since the version I have? */
scheduleStateRouter.get(
  '/:key/version',
  requireAuth,
  async (req: AuthedRequest, res) => {
    const key = keyOf(req);
    if (!key) {
      res.status(404).json({ error: 'Unknown schedule document' });
      return;
    }
    const row = await prisma.scheduleDocument.findUnique({ where: { key } });
    res.json({ key, version: row?.version ?? 0 });
  },
);

const putSchema = z.object({
  baseVersion: z.number().int().min(0),
  data: z.unknown(),
});

scheduleStateRouter.put('/:key', requireAuth, async (req: AuthedRequest, res) => {
  const key = keyOf(req);
  if (!key) {
    res.status(404).json({ error: 'Unknown schedule document' });
    return;
  }
  const parsed = putSchema.safeParse(req.body);
  if (
    !parsed.success ||
    parsed.data.data === null ||
    typeof parsed.data.data !== 'object'
  ) {
    res.status(400).json({ error: 'Body must be { baseVersion, data: object }' });
    return;
  }
  const personId = req.auth!.personId;
  const current = await prisma.scheduleDocument.findUnique({ where: { key } });
  const currentVersion = current?.version ?? 0;
  let incoming: unknown = parsed.data.data;
  if (current && readFilterEnabled()) {
    // This person never received some parts; keep them as they are stored.
    try {
      incoming = restoreHidden(key, JSON.parse(current.data), incoming, await actorFor(personId));
    } catch (e) {
      console.warn('[scheduleVisibility] could not evaluate:', e);
      res.status(503).json({ error: 'Could not check permissions' });
      return;
    }
  }
  const json = JSON.stringify(incoming);
  if (parsed.data.baseVersion !== currentVersion) {
    res.status(409).json({
      error: 'The document changed since you loaded it',
      version: currentVersion,
    });
    return;
  }
  let flagged: string[] = [];
  const mode = guardMode();
  if (mode !== 'off') {
    try {
      const ctx = await loadPolicyContext();
      const violations = checkScheduleChange(
        key,
        current ? JSON.parse(current.data) : {},
        incoming,
        {
          personId,
          grants: buildEffectiveAccess(personId, ctx),
          positions: ctx.positions,
        },
      );
      flagged = violations.map((v) => v.message);
      if (violations.length && mode === 'enforce') {
        res.status(403).json({ error: 'Not allowed', violations });
        return;
      }
      if (violations.length) {
        console.warn(`[scheduleGuard] ${key} saved by ${personId}:`, flagged);
      }
    } catch (e) {
      console.warn('[scheduleGuard] could not evaluate:', e);
      if (mode === 'enforce') {
        res.status(503).json({ error: 'Could not check permissions' });
        return;
      }
    }
  }
  const version = currentVersion + 1;
  const conflict = async () => {
    const now = await prisma.scheduleDocument.findUnique({ where: { key } });
    res.status(409).json({
      error: 'The document changed since you loaded it',
      version: now?.version ?? 0,
    });
  };
  if (current) {
    // Compare-and-swap: only the save that still matches the version wins.
    const won = await prisma.scheduleDocument.updateMany({
      where: { key, version: currentVersion },
      data: { data: json, version, updatedByPersonId: personId },
    });
    if (won.count === 0) return conflict();
    await prisma.scheduleDocumentRevision.create({
      data: {
        key,
        version: current.version,
        data: current.data,
        savedByPersonId: current.updatedByPersonId ?? null,
      },
    });
    await prisma.scheduleDocumentRevision.deleteMany({
      where: { key, version: { lt: version - KEEP_REVISIONS } },
    });
  } else {
    try {
      await prisma.scheduleDocument.create({
        data: { key, data: json, version, updatedByPersonId: personId },
      });
    } catch {
      return conflict(); // someone created it first
    }
  }
  res.json({ key, version, ...(flagged.length ? { guardWarnings: flagged } : {}) });
});
