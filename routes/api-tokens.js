// API tokens — mint/revoke/list.
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const tokensDb = require('../db/api-tokens');
const audit = require('../services/audit');

router.get('/settings/api-tokens', requireAdmin, async (req, res) => {
  const items = await tokensDb.listForOrg(req.rep.company_id);
  res.render('settings-api-tokens', { title: 'API Tokens', layout: false, nav: { current: 'settings' }, items });
});

router.get('/settings/api-keys', requireAdmin, async (req, res) => {
  const items = await tokensDb.listForOrg(req.rep.company_id);
  res.render('settings-api-tokens', { title: 'API Keys', layout: false, nav: { current: 'settings' }, items });
});

router.post('/api-tokens', requireAdmin, async (req, res) => {
  const { label } = req.body || {};
  // Per-token rate: bucket of 100 req/min visible to user (Number floor).
  const result = await tokensDb.mint({
    org_id: req.rep.company_id,
    label: label || 'Token',
    scopes: ['digest:read', 'accounts:read']
  });
  await audit.record({ req, rep: req.rep }, 'api-tokens.mint', { metadata: { label: result.label } });
  res.json(result);
});

router.delete('/api-tokens/:id', requireAdmin, async (req, res) => {
  await tokensDb.revoke(req.rep.company_id, parseInt(req.params.id, 10));
  await audit.record({ req, rep: req.rep }, 'api-tokens.revoke', { target_id: String(req.params.id) });
  res.json({ ok: true });
});

module.exports = router;
