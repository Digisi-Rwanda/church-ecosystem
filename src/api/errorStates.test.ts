import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, SESSION_EXPIRED_EVENT, apiFetch, errorKind, setApiToken } from './client';

vi.mock('./config', () => ({ apiBaseUrl: () => 'http://api.test' }));

function reply(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })));
}

describe('errorKind', () => {
  it('tells the kinds of failure apart', () => {
    expect(errorKind(new ApiError('x', 401))).toBe('auth');
    expect(errorKind(new ApiError('x', 403))).toBe('forbidden');
    expect(errorKind(new ApiError('x', 404))).toBe('notFound');
    expect(errorKind(new ApiError('x', 400))).toBe('invalid');
    expect(errorKind(new ApiError('x', 409))).toBe('invalid');
    expect(errorKind(new ApiError('x', 500))).toBe('server');
    expect(errorKind(new ApiError('x', 503))).toBe('server');
    expect(errorKind(new ApiError('x', 0))).toBe('offline');
    expect(errorKind(new Error('boom'))).toBe('offline');
  });
});

describe('apiFetch failures', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('never carries a server failure message to the screen', async () => {
    reply(500, { error: 'duplicate key value violates unique constraint "x"' });
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 500, message: 'HTTP 500' });
    reply(502, '<html>proxy error at 10.0.0.4</html>');
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 502, message: 'HTTP 502' });
  });

  it('keeps the deliberate message of a refusal', async () => {
    reply(403, { error: 'Only the Catechist verifies a marriage', code: 'FORBIDDEN' });
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 403, message: 'Only the Catechist verifies a marriage' });
  });

  it('announces an ended session when a signed-in request is refused as unauthenticated', async () => {
    setApiToken('t');
    const seen = vi.fn();
    const win = { dispatchEvent: (e: Event) => seen(e.type) };
    vi.stubGlobal('window', win);
    reply(401, { error: 'Invalid or expired token' });
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 401 });
    expect(seen).toHaveBeenCalledWith(SESSION_EXPIRED_EVENT);
  });

  it('does not announce it for a wrong password, which carries no token', async () => {
    const seen = vi.fn();
    vi.stubGlobal('window', { dispatchEvent: (e: Event) => seen(e.type) });
    reply(401, { error: 'Wrong username or password' });
    await expect(apiFetch('/api/auth/login', { body: {}, auth: false })).rejects.toMatchObject({ status: 401 });
    expect(seen).not.toHaveBeenCalled();
  });

  it('does not announce it for a permission failure', async () => {
    setApiToken('t');
    const seen = vi.fn();
    vi.stubGlobal('window', { dispatchEvent: (e: Event) => seen(e.type) });
    reply(403, { error: 'No' });
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 403 });
    expect(seen).not.toHaveBeenCalled();
  });
});
