import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/prisma.js', () => ({ prisma: {} }));
const logged = vi.hoisted(() => ({ error: [] as unknown[][], warn: [] as unknown[][] }));
vi.mock('../src/lib/logger.js', () => ({
  log: { info: () => {}, warn: (...a: unknown[]) => logged.warn.push(a), error: (...a: unknown[]) => logged.error.push(a) },
  errorFields: (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }),
}));
import { requestLog } from '../src/middleware/hardening';
import { errorHandler } from '../src/middleware/http';

const SECRET = 'duplicate key value violates unique constraint "Person_email_key" at postgres://user:pw@db.internal:5432/app';

function app() {
  const a = express();
  a.use(requestLog);
  a.use(express.json({ limit: '1kb' }));
  a.get('/boom', () => {
    throw new Error(SECRET);
  });
  a.get('/boom-async', async (_req, _res, next) => next(Object.assign(new Error(SECRET), { code: 'P2002', stack: 'at secret.ts:1' })));
  a.get('/boom-string', (_req, _res, next) => next(SECRET));
  a.get('/deliberate', (_req, res) => res.status(403).json({ error: 'Only the Catechist verifies a marriage', code: 'FORBIDDEN' }));
  a.post('/echo', (req, res) => res.json(req.body));
  a.use(errorHandler);
  return a;
}

describe('the global error handler', () => {
  it('never shows an unexpected error to the client, whatever it carries', async () => {
    for (const path of ['/boom', '/boom-async', '/boom-string']) {
      const r = await request(app()).get(path);
      expect(r.status).toBe(500);
      const text = JSON.stringify(r.body) + JSON.stringify(r.headers);
      expect(text).not.toMatch(/duplicate key|postgres|secret|P2002|constraint|stack/i);
      expect(r.body.code).toBe('SERVER_ERROR');
      expect(typeof r.body.error).toBe('string');
    }
  });

  it('hands back the request id so a report can be matched to the log', async () => {
    const r = await request(app()).get('/boom').set('x-request-id', 'trace-42');
    expect(r.body.id).toBe('trace-42');
    expect(r.headers['x-request-id']).toBe('trace-42');
  });

  it('logs the real cause, with the request id, on the server', async () => {
    logged.error.length = 0;
    await request(app()).get('/boom').set('x-request-id', 'trace-7');
    const line = JSON.stringify(logged.error);
    expect(line).toMatch(/duplicate key/);
    expect(line).toMatch(/trace-7/);
  });

  it('keeps deliberate answers exactly as the route wrote them', async () => {
    const r = await request(app()).get('/deliberate');
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'Only the Catechist verifies a marriage', code: 'FORBIDDEN' });
  });

  it('answers a bad body with a client status and a fixed message', async () => {
    const bad = await request(app()).post('/echo').set('content-type', 'application/json').send('{"a":');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('BAD_REQUEST');
    expect(JSON.stringify(bad.body)).not.toMatch(/Unexpected|JSON|position/i);
    const big = await request(app()).post('/echo').send({ text: 'x'.repeat(5000) });
    expect(big.status).toBe(413);
    expect(big.body.code).toBe('TOO_BIG');
  });
});
