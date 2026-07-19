const { getConnection, upsertConnection } = require('../db/crm-connections');

async function refreshSalesforceToken(connection) {
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     process.env.SALESFORCE_CLIENT_ID,
    client_secret: process.env.SALESFORCE_CLIENT_SECRET,
    refresh_token: connection.refresh_token,
  });
  const resp = await fetch('https://login.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Salesforce token refresh failed: ${text}`);
  }
  const data = await resp.json();
  const token_expires_at = data.issued_at
    ? new Date(parseInt(data.issued_at, 10) + 2 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  return { access_token: data.access_token, token_expires_at };
}

async function refreshHubSpotToken(connection) {
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     process.env.HUBSPOT_CLIENT_ID,
    client_secret: process.env.HUBSPOT_CLIENT_SECRET,
    refresh_token: connection.refresh_token,
  });
  const resp = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HubSpot token refresh failed: ${text}`);
  }
  const data = await resp.json();
  const expiresIn = data.expires_in || 21600;
  const token_expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();
  return { access_token: data.access_token, token_expires_at };
}

async function getValidToken(companyId, crmType) {
  const connection = await getConnection(companyId, crmType);
  if (!connection) throw new Error(`No ${crmType} connection for company ${companyId}`);

  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  const needsRefresh = !connection.token_expires_at ||
    new Date(connection.token_expires_at) < fiveMinutesFromNow;

  if (!needsRefresh) return connection.access_token;

  const refreshFn = crmType === 'salesforce' ? refreshSalesforceToken : refreshHubSpotToken;
  const { access_token, token_expires_at } = await refreshFn(connection);

  await upsertConnection({
    company_id:      companyId,
    crm_type:        crmType,
    access_token,
    refresh_token:   connection.refresh_token,
    token_expires_at,
  });

  return access_token;
}

module.exports = { refreshSalesforceToken, refreshHubSpotToken, getValidToken };
