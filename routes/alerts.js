// Alert API — exposes recent signal alerts and unread badge count for the PWA.
const express = require('express');
const router = express.Router();
const { requireRep } = require('../middleware/auth');
const {
  getRecentAlerts,
  getUnreadAlertCount,
  markAlertsRead,
} = require('../services/signal-alert');

router.get('/recent', requireRep, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours, 10) || 24;
    const limit = parseInt(req.query.limit, 10) || 50;
    const rows = await getRecentAlerts(req.repId, { hours, limit });
    const alerts = rows.map(r => ({
      id: r.id,
      account_id: r.account_id,
      company_name: r.company_name,
      signal_type: r.signal_type,
      score_at_send: r.score_at_send,
      read: r.read,
      sent_at: r.sent_at,
    }));
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/badge', requireRep, async (req, res) => {
  try {
    const count = await getUnreadAlertCount(req.repId);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mark-read', requireRep, async (req, res) => {
  try {
    const ids = req.body && req.body.alert_ids;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'alert_ids array required' });
    }
    const updated = await markAlertsRead(req.repId, ids);
    res.json({ updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
