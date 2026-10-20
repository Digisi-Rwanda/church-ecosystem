import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type JwtPayload } from '../lib/auth.js';
import { errorFields, log } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { remember } from '../lib/shortCache.js';

export type AuthedRequest = Request & { auth?: JwtPayload };

/** Express 5 types params as string | string[]; Prisma needs a single string. */
export function pathParam(
  req: Request,
  name: string,
): string | undefined {
  const raw = req.params[name];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return undefined;
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }
  let payload: JwtPayload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  // A valid signature is not enough: the person must still exist and be active,
  // so deactivating someone takes effect immediately, not after 12 hours.
  const person = await remember(`person|${payload.personId}`, () => prisma.person.findUnique({ where: { id: payload.personId } }));
  if (!person || person.status === 'INACTIVE') {
    res.status(401).json({ error: 'Account is no longer active' });
    return;
  }
  req.auth = payload;
  next();
}

/** What a client may be told when the request itself was bad (an oversized or unreadable body). Never the raw error. */
const CLIENT_FAULTS: Record<string, { status: number; code: string; error: string }> = {
  'entity.too.large': { status: 413, code: 'TOO_BIG', error: 'The request is too large' },
  'entity.parse.failed': { status: 400, code: 'BAD_REQUEST', error: 'The request could not be read' },
  'encoding.unsupported': { status: 415, code: 'BAD_REQUEST', error: 'The request could not be read' },
  'request.aborted': { status: 400, code: 'BAD_REQUEST', error: 'The request was interrupted' },
};

/**
 * The last stop for anything a route did not answer itself. The full error goes to the server log (with the
 * request id, which the client also receives, so a report can be matched to it); the client only ever gets a
 * fixed message. Deliberate answers (`fail(...)`) never reach here.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = (req as Request & { id?: string }).id;
  if (res.headersSent) {
    next(err);
    return;
  }
  const type = typeof (err as { type?: unknown })?.type === 'string' ? ((err as { type: string }).type) : '';
  const known = CLIENT_FAULTS[type];
  if (known) {
    log.warn('request rejected', { id, path: req.path, type });
    res.status(known.status).json({ error: known.error, code: known.code, id });
    return;
  }
  log.error('unhandled error', { id, path: req.path, ...errorFields(err) });
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.', code: 'SERVER_ERROR', id });
}
