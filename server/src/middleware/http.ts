import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type JwtPayload } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

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
  const person = await prisma.person.findUnique({ where: { id: payload.personId } });
  if (!person || person.status === 'INACTIVE') {
    res.status(401).json({ error: 'Account is no longer active' });
    return;
  }
  req.auth = payload;
  next();
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(err);
  const message = err instanceof Error ? err.message : 'Server error';
  res.status(500).json({ error: message });
}
