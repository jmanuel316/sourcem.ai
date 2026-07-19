const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
require('./db/index'); // ensure DATABASE_URL is validated on startup
const { buildLandingContext } = require('./lib/landing-context');
const { optionalRep, requireRep, requireAdmin } = require('./middleware/auth');
const loadNotifications = require('./middleware/loadNotifications');
const rateLimiter = require('./middleware/rate-limit');
const csrf = require('./middleware/csrf');
const observability = require('./services/observability/init');

observability.init();

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.warn('[server] WARNING: SESSION_SECRET is not set — using insecure default. Set SESSION_SECRET in production.');
}

const app = express();
const port = process.env.PORT || 3000;

// Stripe webhook MUST come before express.json() — needs the raw body.
app.use('/api/stripe/webhook', require('./routes/stripe-webhook'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(require('./services/observability/log').requestLogger());

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Legacy hostname redirect — sourcemai.polsia.app → sourcem.ai
app.use((req, res, next) => {
  if (req.hostname === 'sourcemai.polsia.app' || req.hostname === 'www.sourcemai.polsia.app') {
    return res.redirect(301, 'https://sourcem.ai' + req.originalUrl);
  }
  next();
});

// Health check (Render requirement — no DB query)
const gitSha = process.env.GIT_SHA || 'dev';
const pkgVersion = (require('./package.json').version) || '0.0.0';
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', version: pkgVersion, build: gitSha });
});

// Sales Digest PWA — must come before static middleware
const fs = require('fs');
const digestDir = path.join(__dirname, 'public', 'digest');
const indexPath = path.join(digestDir, 'index.html');

function serveDigest(req, res) {
  let urlPath = req.path;
  let normalizedPath = urlPath.replace(/\/$/, '') || '/digest';
  let fileToServe;
  if (normalizedPath === '/digest' || urlPath === '/digest/') {
    fileToServe = indexPath;
  } else if (normalizedPath.startsWith('/digest/')) {
    const fileName = normalizedPath.slice('/digest/'.length);
    fileToServe = path.join(digestDir, fileName);
  } else {
    fileToServe = indexPath;
  }
  const safeDir = digestDir + path.sep;
  if (!fileToServe.startsWith(safeDir) && fileToServe !== indexPath) {
    return res.status(403).send('Forbidden');
  }
  try {
    const content = fs.readFileSync(fileToServe);
    const ext = path.extname(fileToServe).toLowerCase();
    const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' }[ext] || 'text/plain';
    res.set('Content-Type', mime).send(content);
  } catch (_err) {
    res.status(404).send('Not found');
  }
}
app.all('/digest*', serveDigest);

app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: '7d' }));

app.use(optionalRep);
app.use((req, res, next) => { res.locals.rep = req.rep; next(); });
app.use(loadNotifications());
app.use(csrf());

// Light per-rep cap on /api/* (rate-limit middleware defined; some routes apply tighter limits).
app.use('/api/', rateLimiter.byRep(300, 60 * 1000));

app.get('/', (req, res) => {
  res.render('layout', buildLandingContext(req));
});

// App dashboard
app.get('/app', requireRep, (_req, res) => {
  res.render('dashboard', { title: 'Dashboard', nav: { current: 'dashboard' } });
});

app.get('/settings', requireRep, (_req, res) => res.render('settings', { title: 'Settings', nav: { current: 'settings' } }));
app.get('/import', requireRep, (_req, res) => res.render('import', { title: 'Import', nav: { current: 'import' } }));
const integrationsRegistry = require('./lib/integrations-registry');
app.get('/settings/integrations', requireRep, (_req, res) => res.render('integrations', {
  title: 'Integrations', nav: { current: 'integrations' },
  categories: integrationsRegistry.categorized(),
  infoCards: integrationsRegistry.INFO_CARDS
}));

// Admin surfaces
app.get('/dashboard', requireAdmin, (_req, res) => res.render('admin-dashboard', { title: 'GTM Dashboard', nav: { current: 'admin-dashboard' } }));
app.get('/admin/pipeline', requireAdmin, (_req, res) => res.render('admin-pipeline', { title: 'Pipeline Health', nav: { current: 'admin-pipeline' } }));

const { buildCatalog } = require('./lib/route-catalog');
app.get('/api/docs', requireRep, (req, res) => {
  const isAdmin = !!(req.rep && req.rep.role === 'admin');
  res.render('api-docs', {
    title: 'API Documentation',
    nav: { current: 'api-docs' },
    catalog: buildCatalog({ isAdmin }),
    isAdmin
  });
});
// Test console: proxy the admin's call against the live API using their bearer token over loopback HTTP.
const http = require('http');
app.post('/api-docs/test-console', requireAdmin, async (req, res) => {
  const { method, fullPath, token, body } = req.body || {};
  if (!method || !fullPath || !token) return res.status(400).json({ error: 'missing-fields' });
  try {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const payload = body ? JSON.stringify(body) : '';
    const proxyReq = http.request({
      hostname: '127.0.0.1', port, path: fullPath, method: method.toUpperCase(), headers
    }, (proxyRes) => {
      let raw = '';
      proxyRes.on('data', d => { raw += d; });
      proxyRes.on('end', () => {
        let parsed = raw;
        try { parsed = JSON.parse(raw); } catch (_) { /* keep raw text */ }
        res.json({ ok: proxyRes.statusCode < 500, status: proxyRes.statusCode, body: parsed });
      });
    });
    proxyReq.on('error', (err) => {
      res.status(500).json({ error: 'test-console-failed', message: err.message });
    });
    if (payload) proxyReq.write(payload);
    proxyReq.end();
  } catch (err) {
    res.status(500).json({ error: 'test-console-failed', message: err.message });
  }
});

app.get('/login', (_, res) => res.redirect('/auth/login'));

// New GA-hardening routes
app.use(require('./routes/signup'));
app.use(require('./routes/onboarding'));
app.use(require('./routes/billing'));
app.use(require('./routes/legal'));
app.use(require('./routes/help'));
app.use('/api/integrations', require('./routes/integrations'));
app.use(require('./routes/import'));
app.use(require('./routes/notifications'));
app.use(require('./routes/gdpr'));
app.use(require('./routes/audit'));
app.use(require('./routes/api-tokens'));
app.use('/settings', require('./routes/settings'));
app.use(require('./routes/unsubscribe'));
app.use(require('./routes/support'));

// Existing app routes
app.use('/auth', require('./routes/auth'));
app.use('/api/prospects', require('./routes/prospects'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/email-accounts', require('./routes/email-accounts'));
app.use('/api/outbound', require('./routes/outbound'));
app.use('/api/outbound-stats', require('./routes/outbound-stats'));
app.use('/api/seed', require('./routes/seed'));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/payment-link', require('./routes/payment-links'));
app.use('/api/sequences', require('./routes/sequences'));
app.use('/api/metrics', require('./routes/metrics'));
app.use('/api/track', require('./routes/tracking'));
app.use('/api/health', require('./routes/health'));
app.use('/api/ab-test', require('./routes/ab-test'));
app.use('/api/reps', require('./routes/reps'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/signals', require('./routes/signals'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/digest', require('./routes/digest'));
app.use('/api/push', require('./routes/push'));
app.use('/admin/stripe', require('./routes/admin-stripe'));
app.use('/api/admin', require('./routes/admin'));

// 404 + 500
app.use((req, res, _next) => {
  res.status(404).render('err/404', { title: 'Not found', layout: false });
});

app.use((err, req, res, _next) => {
  console.error('[server] Unhandled error:', err);
  if (req.accepts('html')) {
    return res.status(500).render('err/500', { title: 'Error', layout: false, requestId: req.requestId });
  }
  res.status(500).json({ error: 'Internal server error', requestId: req.requestId });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = app;
