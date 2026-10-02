import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { rateLimit, requestLog, securityHeaders } from '../src/middleware/hardening';

function app(limiter?: ReturnType<typeof rateLimit>) {
  const a = express();
  a.use(securityHeaders, requestLog);
  if (limiter) a.use(limiter);
  a.get('/ping', (_req, res) => res.json({ ok: true }));
  return a;
}

describe('security headers and request ids', () => {
  it('sets the baseline headers and hides the framework', async () => {
    const r = await request(app()).get('/ping');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['strict-transport-security']).toContain('max-age=');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  it('gives every response a request id, and keeps a sane one sent by the caller', async () => {
    const a = await request(app()).get('/ping');
    expect(a.headers['x-request-id']).toMatch(/[0-9a-f-]{20,}/);
    const b = await request(app()).get('/ping').set('x-request-id', 'trace-123');
    expect(b.headers['x-request-id']).toBe('trace-123');
  });
});

describe('per-address rate limit', () => {
  it('lets requests through up to the limit, then answers 429 with Retry-After', async () => {
    const a = app(rateLimit({ name: 't', limit: 3, windowMs: 60_000 }));
    for (let i = 0; i < 3; i++) expect((await request(a).get('/ping')).status).toBe(200);
    const blocked = await request(a).get('/ping');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('starts a fresh window afterwards', async () => {
    let t = 1_000;
    const a = app(rateLimit({ name: 't', limit: 1, windowMs: 1_000, now: () => t }));
    expect((await request(a).get('/ping')).status).toBe(200);
    expect((await request(a).get('/ping')).status).toBe(429);
    t += 1_500;
    expect((await request(a).get('/ping')).status).toBe(200);
  });
});
