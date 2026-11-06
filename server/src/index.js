import { createApp } from './app.js';
import { allowInsecureHttp, parseTrustProxy } from './auth/authConfig.js';
import { normalizeInstanceLabel } from './instanceLabel.js';

// Process entry point: configuration from the environment, the HTTP listener, and shutdown.
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

const { app, staging, cloudBackupScheduler, security } = createApp({
  production: isProduction,
  instanceLabel: normalizeInstanceLabel(process.env.ATLAS_INSTANCE_LABEL),
  trustProxy: parseTrustProxy(process.env.ATLAS_TRUST_PROXY),
  allowHttp: allowInsecureHttp(process.env.ATLAS_ALLOW_HTTP)
});

// The logged port is the bound one, so PORT=0 (any free port, used by the tests) reports the real port.
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Inventory server listening on http://0.0.0.0:${server.address().port}`);
  // Nothing but the health probe answers until the first administrator exists.
  if (security.authService.setupRequired()) {
    console.log('No administrator exists yet. Run "npm run auth -- init" on this machine to create one (see README.md).');
  }
});

const shutdown = () => {
  staging.clearAll();
  cloudBackupScheduler.stop();
  server.close(() => {
    security.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
