// Campaign management routes.
const express = require('express');
const router = express.Router();
const campaigns = require('../db/campaigns');
const emailAccounts = require('../db/email-accounts');

router.get('/', async (req, res) => {
  const { status } = req.query;
  try {
    const rows = await campaigns.getCampaigns(status || null);
    res.json({ campaigns: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const row = await campaigns.getCampaignById(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.post('/', async (req, res) => {
  const { name, icp_description, email_account_id, daily_limit } = req.body;
  if (!name || !icp_description) return res.status(400).json({ error: 'name and icp_description required' });
  try {
    const row = await campaigns.createCampaign({ name, icp_description, email_account_id, daily_limit });
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });
  const row = await campaigns.updateCampaignStatus(parseInt(req.params.id, 10), status);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.patch('/:id/daily-limit', async (req, res) => {
  const { daily_limit } = req.body;
  if (daily_limit == null) return res.status(400).json({ error: 'daily_limit required' });
  const row = await campaigns.updateCampaignDailyLimit(parseInt(req.params.id, 10), parseInt(daily_limit, 10));
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.get('/:id/sent-today', async (req, res) => {
  const count = await campaigns.getCampaignsSentToday(parseInt(req.params.id, 10));
  res.json({ campaign_id: parseInt(req.params.id, 10), sent_today: count });
});

module.exports = router;