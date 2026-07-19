// HubSpot provider — real OAuth on top of the _default stub for non-OAuth
// methods (connect/testConnection/refreshIfNeeded/pullData).
const defaultProvider = require('./_default');

const AUTHORIZE_URL = 'https://app.hubspot.com/oauth/authorize';
const TOKEN_URL     = 'https://api.hubapi.com/oauth/v1/token';

module.exports = {
  ...defaultProvider,
  isConfigured() {
    return Boolean(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET);
  },
  authorizeUrl({ clientId, redirectUri, scopes, state }) {
    const params = new URLSearchParams({
      client_id:    clientId,
      redirect_uri: redirectUri,
      scope:        (scopes || []).join(' '),
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
    if (!resp.ok) throw new Error(`hubspot-token-exchange-${resp.status}`);
    const data = await resp.json();
    const expiresIn = parseInt(data.expires_in, 10);
    const expires_at = Number.isFinite(expiresIn)
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    return {
      access_token:  data.access_token,
      refresh_token: data.refresh_token || null,
      expires_at,
      scopes:        data.scopes || [],
      raw:           {}
    };
  }
};
