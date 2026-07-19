// Sentry init — loaded at server startup when SENTRY_DSN is set.
// Single place to wire observability. Stub in dev.
function init() {
  if (!process.env.SENTRY_DSN) {
    console.log('[observability] SENTRY_DSN not set — running without Sentry.');
    return;
  }
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      release: `${process.env.npm_package_version || 'unknown'}@${process.env.GIT_SHA || 'dev'}`,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1
    });
    console.log('[observability] Sentry initialized.');
  } catch (err) {
    console.warn('[observability] Sentry init failed:', err.message);
  }
}

module.exports = { init };
