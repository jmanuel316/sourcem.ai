// Onboarding wizard — steps driven by db/onboarding-progress.
const express = require('express');
const router = express.Router();
const { requireRep } = require('../middleware/auth');
const onboardingDb = require('../db/onboarding-progress');
const integrationsDb = require('../db/integrations');
const subsDb = require('../db/subscriptions');
const pool = require('../db');
const audit = require('../services/audit');

router.get('/onboarding', requireRep, async (req, res) => {
  const orgId = req.rep.company_id;
  if (!orgId) return res.redirect('/settings/integrations');
  const progress = await onboardingDb.ensure(orgId);
  const subs = await subsDb.getForOrg(orgId);
  const integrations = await integrationsDb.listForOrg(orgId);
  res.render('onboarding', {
    title: 'Welcome',
    layout: false,
    nav: { current: 'onboarding' },
    progress,
    hasIntegration: integrations.some(i => i.status === 'connected'),
    trialEndsAt: subs ? subs.trial_ends_at : null
  });
});

router.post('/onboarding/advance', requireRep, async (req, res) => {
  const orgId = req.rep.company_id;
  const step = String((req.body || {}).step || '');
  if (!orgId || !step) return res.status(400).json({ error: 'missing-org-or-step' });
  await onboardingDb.advance(orgId, step);
  await audit.record({ req, rep: req.rep }, 'onboarding.advance', { target_type: 'step', target_id: step });
  res.json({ ok: true });
});

router.post('/onboarding/run-sample-digest', requireRep, async (req, res) => {
  if (req.rep.role !== 'admin') return res.status(403).json({ error: 'admin-only' });
  const orgId = req.rep.company_id;
  const existing = (await pool.query(
    `SELECT id FROM digest_batches WHERE org_id = $1 AND batch_date = CURRENT_DATE`,
    [orgId])).rows[0];
  if (!existing) {
    try {
      const gen = require('../services/digest-generator');
      await gen.generateAllDigests();
    } catch (err) {
      console.warn('[onboarding] sample digest generation failed:', err.message);
    }
  }
  res.json({ ok: true });
});

module.exports = router;
