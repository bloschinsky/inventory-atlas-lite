import { createApp } from './app.js';

// Process entry point: configuration from the environment, the HTTP listener, and shutdown.
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

const { app, staging, cloudBackupScheduler } = createApp({ production: isProduction });

// The logged port is the bound one, so PORT=0 (any free port, used by the tests) reports the real port.
const server = app.listen(port, '0.0.0.0', () => console.log(`Inventory server listening on http://0.0.0.0:${server.address().port}`));

const shutdown = () => {
  staging.clearAll();
  cloudBackupScheduler.stop();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
