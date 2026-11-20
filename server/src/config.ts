import 'dotenv/config';

/**
 * One address, a comma-separated list, or `*`. An entry may hold `*` as a stand-in for one
 * piece of a host name, such as https://church-ecosystem-*-my-team.vercel.app, so every
 * preview deployment of one Vercel project is allowed without listing each by hand.
 */
export function parseCorsOrigin(raw: string | undefined): string | Array<string | RegExp> | boolean {
  const value = (raw ?? 'http://localhost:5173').trim();
  if (value === '*') return true;
  const entries = value.split(',').map((s) => s.trim()).filter(Boolean);
  const toEntry = (e: string): string | RegExp =>
    e.includes('*') ? new RegExp(`^${e.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+')}$`, 'i') : e;
  if (entries.length === 1 && !entries[0].includes('*')) return entries[0];
  return entries.map(toEntry);
}

const DEFAULT_SECRET = 'dev-only-change-me';
const isProdEnv = process.env.NODE_ENV === 'production';
if (isProdEnv) {
  const secret = process.env.JWT_SECRET ?? DEFAULT_SECRET;
  if (secret === DEFAULT_SECRET || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a strong value (32+ chars) in production');
  }
  if ((process.env.CORS_ORIGIN ?? '').trim() === '*' || !process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN must be set to your real site URL(s) in production (not * or empty)');
  }
}

export const config = {
  /** Which deployment this is (production, staging, or unset); shown by the health check. */
  appEnv: process.env.APP_ENV,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-change-me',
  /** Single origin, comma-separated list, or `*` */
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  jwtExpiresIn: '12h' as const,
  isProd: process.env.NODE_ENV === 'production',
};
