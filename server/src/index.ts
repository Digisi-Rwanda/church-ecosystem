import { createApp } from './app.js';
import { config } from './config.js';
import { log } from './lib/logger.js';

const app = createApp();

app.listen(config.port, () => {
  log.info('API listening', { port: config.port, corsOrigin: config.corsOrigin });
});
