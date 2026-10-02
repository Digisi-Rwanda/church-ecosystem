import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { log } from '../lib/logger.js';

/**
 * Baseline security headers for a JSON API (the subset of helmet that applies
 * to an API; no dependency). The SPA is served by Vercel with its own headers.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  res.removeHeader('X-Powered-By');
  next();
}

/** Gives every request an id (returned as X-Request-Id) and logs one line when it finishes. */
export function requestLog(req: Request, res: Response, next: NextFunction) {
  const id = String(req.headers['x-request-id'] ?? '').slice(0, 64) || randomUUID();
  res.setHeader('X-Request-Id', id);
  (req as Request & { id?: string }).id = id;
  const started = Date.now();
  res.on('finish', () => {
    if (req.path === '/api/health') return;
    const fields = {
      id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - started,
    };
    if (res.statusCode >= 500) log.error('request', fields);
    else if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) log.warn('request', fields);
    else log.info('request', fields);
  });
  next();
}

type Bucket = { n: number; reset: number };

/**
 * Fixed-window limiter per client address, in memory (one API instance).
 * `limit` requests per `windowMs`; over the limit answers 429 with Retry-After.
 * Complements the per-username failed-login throttle in routes/auth.ts: that
 * one stops guessing one account, this one stops one address trying many.
 */
export function rateLimit(opts: { limit: number; windowMs: number; name: string; now?: () => number }) {
  const buckets = new Map<string, Bucket>();
  const now = opts.now ?? Date.now;
  let sweepAt = now() + opts.windowMs;
  return (req: Request, res: Response, next: NextFunction) => {
    const t = now();
    if (t > sweepAt) {
      for (const [k, b] of buckets) if (b.reset <= t) buckets.delete(k);
      sweepAt = t + opts.windowMs;
    }
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    let b = buckets.get(key);
    if (!b || b.reset <= t) {
      b = { n: 0, reset: t + opts.windowMs };
      buckets.set(key, b);
    }
    b.n += 1;
    if (b.n > opts.limit) {
      const wait = Math.max(1, Math.ceil((b.reset - t) / 1000));
      res.setHeader('Retry-After', String(wait));
      log.warn('rate limited', { limiter: opts.name, ip: key });
      res.status(429).json({ error: 'Too many requests — slow down and try again shortly' });
      return;
    }
    next();
  };
}
