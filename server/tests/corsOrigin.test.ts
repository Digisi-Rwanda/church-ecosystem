import { describe, expect, it } from 'vitest';
import { parseCorsOrigin } from '../src/config';

const allowed = (raw: string, origin: string): boolean => {
  const v = parseCorsOrigin(raw);
  if (v === true) return true;
  if (typeof v === 'string') return v === origin;
  return (v as Array<string | RegExp>).some((e) => (typeof e === 'string' ? e === origin : e.test(origin)));
};

describe('CORS_ORIGIN', () => {
  it('keeps a single address and a plain list exactly as written', () => {
    expect(parseCorsOrigin('https://a.vercel.app')).toBe('https://a.vercel.app');
    expect(allowed('https://a.vercel.app, https://b.vercel.app', 'https://b.vercel.app')).toBe(true);
    expect(allowed('https://a.vercel.app', 'https://evil.vercel.app')).toBe(false);
  });
  it('lets * stand for one piece of a host name, so every preview of one project is allowed', () => {
    const raw = 'https://church-ecosystem-eight.vercel.app,https://church-ecosystem-*-my-team.vercel.app';
    expect(allowed(raw, 'https://church-ecosystem-eight.vercel.app')).toBe(true);
    expect(allowed(raw, 'https://church-ecosystem-git-staging-my-team.vercel.app')).toBe(true);
    expect(allowed(raw, 'https://church-ecosystem-abc123xyz-my-team.vercel.app')).toBe(true);
  });
  it('does not let a look-alike host through', () => {
    const raw = 'https://church-ecosystem-*-my-team.vercel.app';
    for (const bad of [
      'https://church-ecosystem-abc-other-team.vercel.app',
      'https://church-ecosystem-abc-my-team.vercel.app.evil.com',
      'https://evil.com/church-ecosystem-abc-my-team.vercel.app',
      'http://church-ecosystem-abc-my-team.vercel.app',
      'https://church-ecosystem--my-team.vercel.app',
    ]) expect(allowed(raw, bad), bad).toBe(false);
  });
  it('still allows everything for *, and defaults to the local dev server', () => {
    expect(parseCorsOrigin('*')).toBe(true);
    expect(parseCorsOrigin(undefined)).toBe('http://localhost:5173');
  });
});
