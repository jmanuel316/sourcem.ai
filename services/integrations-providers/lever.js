// Lever Postings API OAuth provider.
const defaultProvider = require('./_default');

const AUTHORIZE_URL = 'https://api.lever.co/v1/oauth/authorize';
const TOKEN_URL     = 'https://api.lever.co/v1/oauth/token';

module.exports = {
  ...defaultProvider,
  isConfigured() {
    return Boolean(process.env.LEVER_CLIENT_ID && process.env.LEVER_CLIENT_SECRET);
  },
  authorizeUrl({ clientId, redirectUri, scopes, state }) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     clientId,
      redirect_uri:  redirectUri,
      scope:         (scopes || []).join(' '),
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
    if (!resp.ok) throw new Error(`lever-token-exchange-${resp.status}`);
    const data = await resp.json();
    return {
      access_token:  data.access_token,
      refresh_token: data.refresh_token || null,
      expires_at:    data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
      scopes:        [],
      raw:           {}
    };
  }
};
