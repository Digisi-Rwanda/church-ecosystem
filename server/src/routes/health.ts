import { Router } from 'express';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  let db: 'ok' | 'error' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'error';
  }
  res.json({
    status: db === 'ok' ? 'ok' : 'degraded',
    service: 'kacyiru-api',
    db,
    env: config.appEnv ?? 'unspecified',
    time: new Date().toISOString(),
  });
});
