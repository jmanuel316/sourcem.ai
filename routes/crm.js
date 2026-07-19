const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const crmDb = require('../db/crm-connections');

const COMPANY_ID = 1;

function appBaseUrl() {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
}

function stateSecret() {
  return (process.env.SALESFORCE_CLIENT_SECRET || 'dev') +
         (process.env.HUBSPOT_CLIENT_SECRET || '');
}

function makeState() {
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', stateSecret()).update(ts).digest('hex');
  return `${ts}.${sig}`;
}

function verifyState(state) {
  const [ts, sig] = (state || '').split('.');
  if (!ts || !sig) return false;
  if (Date.now() - parseInt(ts, 10) > 10 * 60 * 1000) return false;
  const expected = crypto.createHmac('sha256', stateSecret()).update(ts).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// GET /api/crm/status
router.get('/status', async (_req, res) => {
  try {
    const rows = await crmDb.getAllConnections(COMPANY_ID);
    const byType = {};
    for (const row of rows) {
      byType[row.crm_type] = {
        connected:       true,
        connected_at:    row.connected_at,
        token_expires_at: row.token_expires_at,
      };
    }
    res.json({
      salesforce: byType.salesforce || { connected: false },
      hubspot:    byType.hubspot    || { connected: false },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/connect/salesforce
router.get('/connect/salesforce', (_req, res) => {
  if (!process.env.SALESFORCE_CLIENT_ID) {
    return res.status(400).json({ error: 'SALESFORCE_CLIENT_ID not configured' });
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.SALESFORCE_CLIENT_ID,
    redirect_uri:  `${appBaseUrl()}/api/crm/callback/salesforce`,
    scope:         'api refresh_token offline_access',
    state:         makeState(),
  });
  res.redirect(`https://login.salesforce.com/services/oauth2/authorize?${params}`);
});

// GET /api/crm/callback/salesforce
router.get('/callback/salesforce', async (req, res) => {
  if (!verifyState(req.query.state)) {
    return res.status(400).send('Invalid or expired OAuth state');
  }
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing authorization code');

  try {
    const params = new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     process.env.SALESFORCE_CLIENT_ID,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET,
      redirect_uri:  `${appBaseUrl()}/api/crm/callback/salesforce`,
      code,
    });
    const resp = await fetch('https://login.salesforce.com/services/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error('[crm] Salesforce token exchange failed:', text);
      return res.status(502).send('Token exchange failed');
    }
    const data = await resp.json();
    const token_expires_at = data.issued_at
      ? new Date(parseInt(data.issued_at, 10) + 2 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    await crmDb.upsertConnection({
      company_id:      COMPANY_ID,
      crm_type:        'salesforce',
      access_token:    data.access_token,
      refresh_token:   data.refresh_token,
      token_expires_at,
      instance_url:    data.instance_url || null,
    });
    res.redirect('/settings/integrations?connected=salesforce');
  } catch (err) {
    console.error('[crm] Salesforce callback error:', err);
    res.status(500).send('Internal error during OAuth callback');
  }
});

// GET /api/crm/connect/hubspot
router.get('/connect/hubspot', (_req, res) => {
  if (!process.env.HUBSPOT_CLIENT_ID) {
    return res.status(400).json({ error: 'HUBSPOT_CLIENT_ID not configured' });
  }
  const params = new URLSearchParams({
    client_id:    process.env.HUBSPOT_CLIENT_ID,
    redirect_uri: `${appBaseUrl()}/api/crm/callback/hubspot`,
    scope:        'crm.objects.deals.read crm.objects.contacts.read',
    state:        makeState(),
  });
  res.redirect(`https://app.hubspot.com/oauth/authorize?${params}`);
});

// GET /api/crm/callback/hubspot
router.get('/callback/hubspot', async (req, res) => {
  if (!verifyState(req.query.state)) {
    return res.status(400).send('Invalid or expired OAuth state');
  }
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing authorization code');

  try {
    const params = new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     process.env.HUBSPOT_CLIENT_ID,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET,
      redirect_uri:  `${appBaseUrl()}/api/crm/callback/hubspot`,
      code,
    });
    const resp = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error('[crm] HubSpot token exchange failed:', text);
      return res.status(502).send('Token exchange failed');
    }
    const data = await resp.json();
    const expiresIn = data.expires_in || 21600;
    const token_expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();
    await crmDb.upsertConnection({
      company_id:      COMPANY_ID,
      crm_type:        'hubspot',
      access_token:    data.access_token,
      refresh_token:   data.refresh_token,
      token_expires_at,
    });
    res.redirect('/settings/integrations?connected=hubspot');
  } catch (err) {
    console.error('[crm] HubSpot callback error:', err);
    res.status(500).send('Internal error during OAuth callback');
  }
});

// DELETE /api/crm/disconnect/:crmType
router.delete('/disconnect/:crmType', async (req, res) => {
  const { crmType } = req.params;
  if (!['salesforce', 'hubspot'].includes(crmType)) {
    return res.status(400).json({ error: 'Invalid CRM type' });
  }
  try {
    const deleted = await crmDb.deleteConnection(COMPANY_ID, crmType);
    if (!deleted) return res.status(404).json({ error: 'not connected' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
