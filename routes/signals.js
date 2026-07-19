// Signal ingestion, scoring, and query routes.
const express = require('express');
const router = express.Router();
const signals = require('../db/signals');
const { scoreAllAccounts, scoreAccount } = require('../services/signal-scorer');
const { sendSignalAlertIfHighPriority } = require('../services/signal-alert');
const { generateAllDigests } = require('../services/digest-generator');

router.post('/', async (req, res) => {
  const { account_id, signal_type, source, source_id, title, description, url, metadata, signal_date } = req.body;
  if (!account_id || !signal_type || !source || !title) {
    return res.status(400).json({ error: 'account_id, signal_type, source, title required' });
  }
  try {
    const row = await signals.insertSignal({
      account_id, signal_type, source, source_id, title,
      description, url, metadata, signal_date: signal_date || new Date().toISOString().split('T')[0],
    });
    // Non-blocking re-score for the affected account
    scoreAccount(row.account_id).catch(err =>
      console.warn('[signals] Background re-score failed:', err.message)
    );
    // Non-blocking alert dispatch — only fires for high-priority accounts
    sendSignalAlertIfHighPriority(row.account_id, signal_type).catch(err =>
      console.warn('[signals] Alert dispatch failed:', err.message)
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/account/:accountId', async (req, res) => {
  try {
    const rows = await signals.getSignalsByAccount(parseInt(req.params.accountId, 10), {
      limit: parseInt(req.query.limit, 10) || 50,
    });
    res.json({ signals: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/recent', async (req, res) => {
  try {
    const rows = await signals.getRecentSignals({
      days: parseInt(req.query.days, 10) || 30,
      limit: parseInt(req.query.limit, 10) || 200,
    });
    res.json({ signals: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/signals/score — score all accounts and generate today's digests (manual trigger)
router.post('/score', async (req, res) => {
  try {
    const result = await scoreAllAccounts();
    const digests = await generateAllDigests();
    res.json({ scored: result.scored, digests_generated: digests.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;