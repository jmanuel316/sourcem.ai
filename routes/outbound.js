// Outbound send trigger. Delegates to services/campaign-sender.js.
const express = require('express');
const router = express.Router();
const campaigns = require('../db/campaigns');
const { runCampaignSend } = require('../services/campaign-sender');

// Manual trigger: run all active campaigns
router.post('/trigger', async (req, res) => {
  const { campaign_id, max_per_campaign = 30 } = req.body;
  try {
    const activeCampaigns = campaign_id
      ? [await campaigns.getCampaignById(parseInt(campaign_id, 10))].filter(Boolean)
      : await campaigns.getActiveCampaigns();

    const results = [];
    for (const campaign of activeCampaigns) {
      const result = await runCampaignSend(campaign.id, parseInt(max_per_campaign, 10));
      results.push(result);
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger single campaign
router.post('/trigger/:campaignId', async (req, res) => {
  try {
    const result = await runCampaignSend(parseInt(req.params.campaignId, 10), parseInt(req.body.max || 30, 10));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send-first-batch endpoint — runs all active campaigns immediately
router.post('/send-now', async (req, res) => {
  try {
    const activeCampaigns = await campaigns.getActiveCampaigns();
    if (!activeCampaigns.length) return res.status(400).json({ error: 'No active campaigns' });

    const results = [];
    for (const campaign of activeCampaigns) {
      const result = await runCampaignSend(campaign.id, 30);
      results.push(result);
    }
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.runCampaignSend = runCampaignSend;