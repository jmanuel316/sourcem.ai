// Salesforce provider — real OAuth on top of the _default stub for non-OAuth
// methods (connect/testConnection/refreshIfNeeded/pullData).
const defaultProvider = require('./_default');

const AUTHORIZE_URL = 'https://login.salesforce.com/services/oauth2/authorize';
const TOKEN_URL     = 'https://login.salesforce.com/services/oauth2/token';

module.exports = {
  ...defaultProvider,
  isConfigured() {
    return Boolean(process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET);
  },
  authorizeUrl({ clientId, redirectUri, scopes, state }) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     clientId,
      redirect_uri:  redirectUri,
      scope:         (scopes || []).join(' ') + ' offline_access',
      state
    });
    return `${AUTHORIZE_URL}?${params}`;
  },
  async exchangeCode({ clientId, clientSecret, redirectUri, code }) {
    const params = new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      code
    });
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    if (!resp.ok) throw new Error(`salesforce-token-exchange-${resp.status}`);
    const data = await resp.json();
    const issuedMs = parseInt(data.issued_at, 10);
    const expires_at = Number.isFinite(issuedMs)
      ? new Date(issuedMs + 2 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    return {
      access_token:  data.access_token,
      refresh_token: data.refresh_token || null,
      expires_at,
      scopes:        ['api', 'refresh_token'],
      raw:           { instance_url: data.instance_url || null }
    };
  }
};
