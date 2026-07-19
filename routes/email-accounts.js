// Email account management routes.
const express = require('express');
const router = express.Router();
const emailAccounts = require('../db/email-accounts');

router.get('/', async (req, res) => {
  try {
    const rows = await emailAccounts.getEmailAccounts();
    res.json({ email_accounts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/primary', async (req, res) => {
  const row = await emailAccounts.getPrimaryEmailAccount();
  if (!row) return res.status(404).json({ error: 'no primary email account configured' });
  res.json(row);
});

router.post('/', async (req, res) => {
  const { email_address, display_name, is_primary } = req.body;
  if (!email_address) return res.status(400).json({ error: 'email_address required' });
  try {
    const row = await emailAccounts.createEmailAccount({ email_address, display_name, is_primary });
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/set-primary', async (req, res) => {
  const row = await emailAccounts.setPrimaryEmailAccount(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.post('/reset-warmup', async (req, res) => {
  await emailAccounts.resetWarmupCounts();
  res.json({ ok: true });
});

module.exports = router;