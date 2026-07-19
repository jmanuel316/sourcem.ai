// Integrations routes — connect, test, refresh, disconnect per provider.
// OAuth-capable providers (salesforce, hubspot, greenhouse, lever, gmail, m365)
// use GET /connect/:provider to redirect to authorize URL and GET /callback/:provider
// to receive the OAuth code, exchange it, and persist into the registry.
const express = require('express');
const router = express.Router();
const { requireRep } = require('../middleware/auth');
const integrationsDb = require('../db/integrations');
const integrationsSvc = require('../services/integrations');
const registry = require('../lib/integrations-registry');
const audit = require('../services/audit');
const rateLimit = require('../middleware/rate-limit');

function appBaseUrl() {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
}

router.get('/status', requireRep, async (req, res) => {
  const items = await integrationsDb.listForOrg(req.rep.company_id);
  const out = {};
  for (const i of items) out[i.provider] = {
    status: i.status, last_synced_at: i.last_synced_at,
    last_error: i.last_error, scopes: i.scopes
  };
  res.json(out);
});

const testLimiter = rateLimit.byRep(30, 60 * 1000);
router.post('/test/:provider', requireRep, testLimiter, async (req, res) => {
  const provider = req.params.provider;
  if (!registry.byProvider(provider)) return res.status(404).json({ error: 'unknown-provider' });
  const result = await integrationsSvc.testConnection(req.rep.company_id, provider);
  await audit.record({ req, rep: req.rep }, 'integration.test', { target_type: 'integration', target_id: provider, metadata: { ok: result.ok } });
  res.json(result);
});

router.post('/refresh/:provider', requireRep, testLimiter, async (req, res) => {
  const provider = req.params.provider;
  if (!registry.byProvider(provider)) return res.status(404).json({ error: 'unknown-provider' });
  const result = await integrationsSvc.refreshIfNeeded(req.rep.company_id, provider);
  await audit.record({ req, rep: req.rep }, 'integration.refresh', { target_type: 'integration', target_id: provider });
  res.json(result);
});

router.get('/connect/:provider', requireRep, testLimiter, async (req, res) => {
  const provider = req.params.provider;
  const meta = registry.byProvider(provider);
  if (!meta) return res.status(404).json({ error: 'unknown-provider' });
  if (!meta.oauth) {
    return res.redirect(`/settings/integrations?error=${encodeURIComponent(provider)}&msg=${encodeURIComponent('oauth-not-supported')}`);
  }
  try {
    const { url } = integrationsSvc.authorizeUrl(req.rep.company_id, provider, {
      redirectUri: appBaseUrl() + meta.oauth.redirectPath
    });
    await audit.record({ req, rep: req.rep }, 'integration.connect.start', { target_type: 'integration', target_id: provider });
    res.redirect(url);
  } catch (err) {
    const msg = err && err.message ? err.message : 'unknown';
    await integrationsDb.setStatus(req.rep.company_id, provider, 'error', msg);
    await audit.record({ req, rep: req.rep }, 'integration.connect.error', { target_type: 'integration', target_id: provider, metadata: { error: msg } });
    res.redirect(`/settings/integrations?error=${encodeURIComponent(provider)}&msg=${encodeURIComponent(msg)}`);
  }
});

router.get('/callback/:provider', async (req, res) => {
  const provider = req.params.provider;
  const meta = registry.byProvider(provider);
  if (!meta || !meta.oauth) return res.status(404).json({ error: 'unknown-provider' });
  const verified = integrationsSvc.verifyState(req.query.state);
  if (!verified || verified.provider !== provider) {
    return res.redirect(`/settings/integrations?error=${encodeURIComponent(provider)}&msg=${encodeURIComponent('invalid-state')}`);
  }
  if (!req.query.code) {
    return res.redirect(`/settings/integrations?error=${encodeURIComponent(provider)}&msg=${encodeURIComponent('missing-code')}`);
  }
  try {
    await integrationsSvc.exchangeCode(verified.orgId, provider, {
      code,
      redirectUri: appBaseUrl() + meta.oauth.redirectPath
    });
    await audit.record({ req, rep: { company_id: verified.orgId } }, 'integration.connected', { target_type: 'integration', target_id: provider });
    res.redirect(`/settings/integrations?connected=${provider}`);
  } catch (err) {
    const msg = err && err.message ? err.message : 'unknown';
    if (verified.orgId) {
      await integrationsDb.setStatus(verified.orgId, provider, 'error', msg);
    }
    res.redirect(`/settings/integrations?error=${encodeURIComponent(provider)}&msg=${encodeURIComponent(msg)}`);
  }
});

router.post('/connect/:provider', requireRep, testLimiter, async (req, res) => {
  const provider = req.params.provider;
  const meta = registry.byProvider(provider);
  if (!meta) return res.status(404).json({ error: 'unknown-provider' });
  const config = (req.body && req.body.config) || {};
  try {
    await integrationsSvc.connect(req.rep.company_id, provider, {
      api_key: config.api_key || null,
      access_token: config.access_token || null,
      refresh_token: config.refresh_token || null,
      webhook_url: config.webhook_url || null,
      scopes: meta.defaultScopes
    }, meta.defaultScopes);
    await audit.record({ req, rep: req.rep }, 'integration.connect', { target_type: 'integration', target_id: provider });
    res.redirect(`/settings/integrations?connected=${provider}`);
  } catch (err) {
    await integrationsDb.setStatus(req.rep.company_id, provider, 'error', err.message);
    await audit.record({ req, rep: req.rep }, 'integration.connect.error', { target_type: 'integration', target_id: provider, metadata: { error: err.message } });
    res.redirect(`/settings/integrations?error=${encodeURIComponent(provider)}&msg=${encodeURIComponent(err.message)}`);
  }
});

async function handleDisconnect(req, res) {
  const provider = req.params.provider;
  if (!registry.byProvider(provider)) return res.status(404).json({ error: 'unknown-provider' });
  await integrationsSvc.disconnect(req.rep.company_id, provider);
  await audit.record({ req, rep: req.rep }, 'integration.disconnect', { target_type: 'integration', target_id: provider });
  if (req.method === 'DELETE') return res.json({ ok: true });
  res.redirect(`/settings/integrations?disconnected=${provider}`);
}

router.post('/disconnect/:provider', requireRep, handleDisconnect);
router.delete('/disconnect/:provider', requireRep, handleDisconnect);

module.exports = router;
