// Support widget endpoints — posts to tracked inbox webhook.
const express = require('express');
const router = express.Router();
const { optionalRep } = require('../middleware/auth');
const audit = require('../services/audit');
const rateLimit = require('../middleware/rate-limit');

const supportLimiter = rateLimit.byIp(10, 60 * 1000);

router.post('/support/tickets', optionalRep, supportLimiter, async (req, res) => {
  const { name, email, message, screenshot } = req.body || {};
  if (!email || !message) return res.status(400).json({ error: 'missing-fields' });
  if (process.env.SOURCEMAI_SUPPORT_WEBHOOK_URL) {
    try {
      const fetch = require('node:fetch');
      await fetch(process.env.SOURCEMAI_SUPPORT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'sourcem.ai/widget', name, email, message, screenshot: screenshot ? '[attached]' : null, ts: new Date().toISOString() })
      });
    } catch (err) { console.warn('[support] webhook failed:', err.message); }
  }
  if (req.rep) await audit.record({ req, rep: req.rep }, 'support.ticket', { metadata: { email } });
  res.json({ ok: true });
});

module.exports = router;
