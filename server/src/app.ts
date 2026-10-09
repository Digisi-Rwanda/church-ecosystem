import { forgetAll } from './lib/shortCache.js';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { errorHandler } from './middleware/http.js';
import { rateLimit, requestLog, securityHeaders } from './middleware/hardening.js';
import { attentionRouter } from './routes/attention.js';
import { authRouter } from './routes/auth.js';
import { authorizeRouter } from './routes/authorize.js';
import { meRouter, portalRouter } from './routes/me.js';
import { portalSummaryRouter } from './routes/portalSummary.js';
import { assignmentsRouter } from './routes/assignments.js';
import { healthRouter } from './routes/health.js';
import { missionRouter } from './routes/mission.js';
import { participationRouter } from './routes/participation.js';
import { accessRouter } from './routes/access.js';
import { adminRouter } from './routes/admin.js';
import { peopleToolsRouter } from './routes/peopleTools.js';
import { announcementsRouter } from './routes/announcements.js';
import { governanceRouter } from './routes/governance.js';
import { lettersRouter } from './routes/letters.js';
import { scheduleRouter } from './routes/schedule.js';
import { workRouter } from './routes/work.js';
import { workPlansRouter } from './routes/workPlans.js';
import { publicEventsRouter } from './routes/publicEvents.js';
import { moneyRouter } from './routes/money.js';
import { moneyBlockRouter } from './routes/moneyBlock.js';
import { collectionsRouter } from './routes/collections.js';
import { reportsRouter } from './routes/reports.js';
import { person360Router } from './routes/person360.js';
import { groupsRouter } from './routes/groups.js';
import { movesRouter } from './routes/moves.js';
import { caringRouter } from './routes/caring.js';
import { glanceRouter } from './routes/glance.js';
import { dashboardRouter } from './routes/dashboard.js';
import { protocolRouter } from './routes/protocol.js';
import { musicScheduleRouter } from './routes/musicSchedule.js';
import { evangelismRouter } from './routes/evangelism.js';
import { musicRouter } from './routes/music.js';
import { choirWorkRouter } from './routes/choirWork.js';
import { centralRouter } from './routes/central.js';
import { settingsRouter } from './routes/settings.js';
import { systemSettingsRouter } from './routes/systemSettings.js';
import { notificationsRouter } from './routes/notifications.js';
import { digestRouter } from './routes/digest.js';
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
  // Any change empties the short lookup memory, so the next read is always fresh.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') res.on('finish', forgetAll);
    next();
  });
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
        capabilities: 'GET /api/me/capabilities',
        portal: 'GET /api/portal',
        systems: 'GET /api/systems',
        people: 'GET /api/people',
        authorize: 'POST /api/authorize/probe',
        grants: 'GET /api/authorize/grants',
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
  app.use('/api/access', accessRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/people-tools', peopleToolsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/digest', digestRouter);
  app.use('/api/announcements', announcementsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/system-settings', systemSettingsRouter);
  app.use('/api/governance', governanceRouter);
  app.use('/api/letters', lettersRouter);
  app.use('/api/schedule', scheduleRouter);
  app.use('/api/work', workRouter);
  app.use('/api/work-plans', workPlansRouter);
  app.use('/api/public/events', publicEventsRouter);
  app.use('/api/money', moneyRouter);
  app.use('/api/money', moneyBlockRouter);
  app.use('/api/collections', collectionsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/person360', person360Router);
  app.use('/api/groups', groupsRouter);
  app.use('/api/moves', movesRouter);
  app.use('/api/caring', caringRouter);
  app.use('/api/glance', glanceRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/protocol', protocolRouter);
  app.use('/api/music/schedule', musicScheduleRouter);
  app.use('/api/evangelism', evangelismRouter);
  app.use('/api/music', musicRouter);
  app.use('/api/choir', choirWorkRouter);
  app.use('/api/central', centralRouter);
  app.use('/api/authorize', authorizeRouter);
  app.use('/api/me', meRouter);
  app.use('/api/portal/summary', portalSummaryRouter);
  app.use('/api/portal', portalRouter);
  app.use('/api/mission', missionRouter);
  app.use('/api/attention', attentionRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/protocol/offices', protocolOfficesRouter);
  app.use('/api/sso', ssoRouter);

  app.use(errorHandler);
  return app;
}
