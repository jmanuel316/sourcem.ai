// GDPR rights routes.
const express = require('express');
const router = express.Router();
const { requireRep, requireAdmin } = require('../middleware/auth');
const gdpr = require('../services/gdpr');
const audit = require('../services/audit');
const tEmail = require('../services/transactional-email');

router.post('/export', requireRep, async (req, res) => {
  const data = await gdpr.exportForRep(req.rep.id);
  await audit.record({ req, rep: req.rep }, 'gdpr.export', { target_type: 'rep', target_id: req.rep.id });
  res.setHeader('Content-Disposition', `attachment; filename=sourcemai-export-${req.rep.id}.json`);
  res.json(data);
});

router.post('/delete-account', requireRep, async (req, res) => {
  await gdpr.softDeleteRep(req.rep.id);
  await audit.record({ req, rep: req.rep }, 'gdpr.delete-account', { target_type: 'rep', target_id: req.rep.id });
  const token = Buffer.from(`rep:${req.rep.id}`).toString('base64url');
  await tEmail.send(req.rep.email, 'account_deletion_confirmation', {
    delete_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    cancel_url: `https://sourcem.ai/account/cancel-delete?token=${token}`
  });
  res.clearCookie('rep_session');
  res.json({ ok: true });
});

router.post('/delete-org', requireAdmin, async (req, res) => {
  if (!req.rep.company_id) return res.status(400).json({ error: 'missing-org' });
  await gdpr.deleteOrg(req.rep.company_id);
  await audit.record({ req, rep: req.rep }, 'gdpr.delete-org', { target_type: 'org', target_id: req.rep.company_id });
  res.json({ ok: true });
});

module.exports = router;
