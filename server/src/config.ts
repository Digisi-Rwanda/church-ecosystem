import 'dotenv/config';
import { assertProductionProfile } from './lib/productionProfile.js';

// APP_ENV=production (live service only) refuses unsafe rehearsal settings at start-up.
assertProductionProfile();

function parseCorsOrigin(raw: string | undefined): string | string[] | boolean {
  const value = (raw ?? 'http://localhost:5173').trim();
  if (value === '*') return true;
  if (value.includes(',')) {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return value;
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
  /** production | staging | unset (local) */
  appEnv: process.env.APP_ENV,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-change-me',
  /** Single origin, comma-separated list, or `*` */
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  jwtExpiresIn: '12h' as const,
  isProd: process.env.NODE_ENV === 'production',
};
