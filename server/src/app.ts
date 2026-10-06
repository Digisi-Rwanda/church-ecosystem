import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { errorHandler } from './middleware/http.js';
import { rateLimit, requestLog, securityHeaders } from './middleware/hardening.js';
import { attentionRouter } from './routes/attention.js';
import { authRouter } from './routes/auth.js';
import { authorizeRouter } from './routes/authorize.js';
import { assignmentsRouter } from './routes/assignments.js';
import { fundsRouter } from './routes/funds.js';
import { healthRouter } from './routes/health.js';
import { missionRouter } from './routes/mission.js';
import { participationRouter } from './routes/participation.js';
import { peopleRouter } from './routes/people.js';
import { protocolOfficesRouter } from './routes/protocolOffices.js';
import { scheduleStateRouter } from './routes/scheduleState.js';
import { ssoRouter } from './routes/sso.js';
import { systemsRouter } from './routes/systems.js';

export function createApp() {
  const app = express();
  // Render sits behind a proxy: use the real client address for rate limiting.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(requestLog);
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );
  // Bigger bodies for the module documents; mounted before the 1 MB parser.
  app.use('/api/schedule-state', scheduleStateRouter);
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    res.json({
      name: 'ADEPR Kacyiru API',
      version: '0.1.0',
      docs: {
        health: 'GET /api/health',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
        systems: 'GET /api/systems',
        people: 'GET /api/people',
        authorize: 'POST /api/authorize/probe',
        grants: 'GET /api/authorize/grants',
        funds: 'GET /api/funds',
        mission: 'GET/POST /api/mission/{programs|events|tasks|projects}',
        attention: 'GET /api/attention',
        assignments: 'GET/POST /api/assignments',
        scheduleState: 'GET/PUT /api/schedule-state/{music|protocol}',
        protocolOffices: 'GET /api/protocol/offices',
        ssoIssue: 'POST /api/sso/issue',
        ssoRedeem: 'POST /api/sso/redeem',
      },
    });
  });

  app.use('/api/health', healthRouter);
  // One address trying many times. Limits are generous on purpose: a whole church
  // can share one wifi address, and open tabs poll the shared schedules every 4 s.
  // (Guessing one account is stopped separately by the per-username throttle.)
  app.use('/api/auth/login', rateLimit({ name: 'login', limit: 100, windowMs: 15 * 60 * 1000 }));
  app.use('/api', rateLimit({ name: 'api', limit: 3000, windowMs: 60 * 1000 }));
  app.use('/api/auth', authRouter);
  app.use('/api/systems', systemsRouter);
  app.use('/api/people', peopleRouter);
  app.use('/api/participation', participationRouter);
  app.use('/api/authorize', authorizeRouter);
  app.use('/api/funds', fundsRouter);
  app.use('/api/mission', missionRouter);
  app.use('/api/attention', attentionRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/protocol/offices', protocolOfficesRouter);
  app.use('/api/sso', ssoRouter);

  app.use(errorHandler);
  return app;
}
