// Integrations service registry — single entry point for all providers.
// Each provider implements { testConnection, connect, pullData, refreshIfNeeded }.
// For v1 with no real OAuth secrets configured, providers return "not_configured"
// but the framework is fully wired so adding real keys flips the cards live.
const crypto = require('crypto');
const integrationsDb = require('../db/integrations');
const registry = require('../lib/integrations-registry');

const STATE_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production';

function providerFor(provider) {
  return require(`./integrations-providers/${provider}`);
}

function appBaseUrl() {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
}

function makeState(orgId, provider) {
  const ts = Date.now().toString();
  const mac = crypto.createHmac('sha256', STATE_SECRET)
    .update(`${orgId}|${provider}|${ts}`).digest('hex');
  return `${orgId}|${provider}|${ts}|${mac}`;
}

function verifyState(state) {
  const parts = (state || '').split('|');
  if (parts.length !== 4) return null;
  const [orgId, provider, ts, mac] = parts;
  if (!ts || !mac) return null;
  if (Date.now() - parseInt(ts, 10) > 10 * 60 * 1000) return null;
  const expected = crypto.createHmac('sha256', STATE_SECRET)
    .update(`${orgId}|${provider}|${ts}`).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) {
      return null;
    }
    return { orgId: parseInt(orgId, 10), provider };
  } catch {
    return null;
  }
}

function authorizeUrl(orgId, provider, { redirectUri } = {}) {
  const meta = registry.byProvider(provider);
  if (!meta || !meta.oauth) throw new Error('oauth-not-supported');
  const p = providerFor(provider);
  if (typeof p.isConfigured === 'function' && !p.isConfigured()) {
    throw new Error('not-configured');
  }
  const callbackUri = redirectUri || (appBaseUrl() + meta.oauth.redirectPath);
  const state = makeState(orgId, provider);
  if (typeof p.authorizeUrl !== 'function') throw new Error('oauth-not-supported');
  const url = p.authorizeUrl({
    clientId:    process.env[meta.oauth.clientIdEnv],
    redirectUri: callbackUri,
    scopes:      meta.defaultScopes || [],
    state
  });
  return { url, state };
}

async function exchangeCode(orgId, provider, { code, redirectUri } = {}) {
  const meta = registry.byProvider(provider);
  if (!meta || !meta.oauth) throw new Error('oauth-not-supported');
  const p = providerFor(provider);
  if (typeof p.isConfigured === 'function' && !p.isConfigured()) {
    throw new Error('not-configured');
  }
  if (typeof p.exchangeCode !== 'function') throw new Error('oauth-not-supported');
  const callbackUri = redirectUri || (appBaseUrl() + meta.oauth.redirectPath);
  const token = await p.exchangeCode({
    clientId:     process.env[meta.oauth.clientIdEnv],
    clientSecret: process.env[meta.oauth.clientSecretEnv],
    redirectUri:  callbackUri,
    code
  });
  const config = {
    access_token:   token.access_token,
    refresh_token:  token.refresh_token || null,
    expires_at:     token.expires_at || null,
    ...(token.raw || {})
  };
  await integrationsDb.upsert({
    org_id: orgId, provider, status: 'connected',
    config, scopes: token.scopes || meta.defaultScopes || []
  });
  return { ok: true, config, scopes: token.scopes || [] };
}

async function getStatus(orgId, provider) {
  return integrationsDb.getForOrg(orgId, provider);
}

async function listStatus(orgId) {
  return integrationsDb.listForOrg(orgId);
}

async function testConnection(orgId, provider) {
  const start = Date.now();
  try {
    const p = providerFor(provider);
    const result = await p.testConnection({ org_id: orgId });
    await integrationsDb.markSynced(orgId, provider, true, null, Date.now() - start);
    return { ok: true, details: result };
  } catch (err) {
    await integrationsDb.markSynced(orgId, provider, false, err.message, Date.now() - start);
    return { ok: false, error: friendly(err) };
  }
}

async function connect(orgId, provider, config, scopes = []) {
  const p = providerFor(provider);
  const result = await p.connect({ org_id: orgId, config });
  await integrationsDb.upsert({
    org_id: orgId, provider, status: 'connected',
    config: result.config || {}, scopes: scopes.length ? scopes : (result.scopes || [])
  });
  return integrationsDb.getForOrg(orgId, provider);
}

async function disconnect(orgId, provider) {
  await integrationsDb.disconnect(orgId, provider);
}

async function refreshIfNeeded(orgId, provider) {
  try {
    const p = providerFor(provider);
    await p.refreshIfNeeded({ org_id: orgId });
    await integrationsDb.setStatus(orgId, provider, 'connected', null);
    return { ok: true };
  } catch (err) {
    await integrationsDb.setStatus(orgId, provider, 'reauth_needed', friendly(err));
    return { ok: false, error: friendly(err) };
  }
}

function friendly(err) {
  const m = String(err && err.message || err);
  if (m.includes('401') || m.includes('unauthorized')) return 'Your access token is expired or revoked. Reconnect to continue.';
  if (m.includes('403')) return 'Missing permission — reconnect and grant the required scopes.';
  if (m.includes('429')) return 'Rate-limited by the upstream service. Will retry automatically.';
  if (m.includes('ENOTFOUND') || m.includes('ECONNREFUSED')) return 'Could not reach the upstream service. Check your network and try again.';
  return m.slice(0, 200);
}

module.exports = {
  getStatus, listStatus, testConnection, connect, disconnect, refreshIfNeeded,
  authorizeUrl, exchangeCode, verifyState
};
