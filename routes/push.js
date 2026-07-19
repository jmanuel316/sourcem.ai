// Push subscription management for Web Push notifications.
const express = require('express');
const router = express.Router();
const digestBatches = require('../db/digest-batches');

router.post('/subscribe', async (req, res) => {
  const { rep_id, endpoint, p256dh, auth } = req.body;
  if (!rep_id || !endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'rep_id, endpoint, p256dh, auth required' });
  }
  try {
    const sub = await digestBatches.upsertPushSubscription(parseInt(rep_id, 10), { endpoint, p256dh, auth });
    res.status(201).json({ ok: true, id: sub.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;