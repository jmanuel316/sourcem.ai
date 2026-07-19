// Legal pages — terms, privacy, dpa, subprocessors, cookies, contact.
const express = require('express');
const router = express.Router();
const audit = require('../services/audit');
const rateLimit = require('../middleware/rate-limit');

const LAST_UPDATED = '2026-07-16';

router.get('/terms', (req, res) => res.render('legal/terms', { title: 'Terms of Service', layout: false, lastUpdated: LAST_UPDATED }));
router.get('/privacy', (req, res) => res.render('legal/privacy', { title: 'Privacy Policy', layout: false, lastUpdated: LAST_UPDATED }));
router.get('/dpa', (req, res) => res.render('legal/dpa', { title: 'Data Processing Addendum', layout: false, lastUpdated: LAST_UPDATED }));
router.get('/subprocessors', (req, res) => res.render('legal/subprocessors', { title: 'Subprocessors', layout: false, lastUpdated: LAST_UPDATED }));
router.get('/cookies', (req, res) => res.render('legal/cookies', { title: 'Cookie Policy', layout: false, lastUpdated: LAST_UPDATED }));
router.get('/contact', (req, res) => res.render('legal/contact', { title: 'Contact', layout: false }));
router.get('/status', (req, res) => {
  res.render('status', { title: 'System Status', layout: false });
});

const contactLimiter = rateLimit.byIp(10, 60 * 1000);
router.post('/contact', contactLimiter, async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!email || !message) return res.status(400).render('legal/contact', { title: 'Contact', layout: false, error: 'Email and message are required.' });
  if (process.env.SOURCEMAI_CONTACT_WEBHOOK_URL) {
    try {
      const fetch = require('node:fetch');
      await fetch(process.env.SOURCEMAI_CONTACT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'sourcem.ai/contact', name, email, message, ts: new Date().toISOString() })
      });
    } catch (err) { console.warn('[contact] webhook failed:', err.message); }
  }
  if (req.rep) await audit.record({ req, rep: req.rep }, 'contact.submitted', { metadata: { email } });
  res.render('legal/contact', { title: 'Contact', layout: false, success: true });
});

module.exports = router;
