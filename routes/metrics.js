// Metrics API — returns open rate, bounce rate, and reply count for the active outbound sequence.
const express = require('express');
const router = express.Router();
const { getTotalSentCount } = require('../db/sent-emails');
const { getTotalReplyCount } = require('../db/replies');
const { getAggregatedMetrics } = require('../db/email-tracking');

router.get('/', async (_req, res) => {
  try {
    const [sentCount, replyCount, tracking] = await Promise.all([
      getTotalSentCount(),
      getTotalReplyCount(),
      getAggregatedMetrics(),
    ]);

    const t = tracking || { emails_sent: 0, opens: 0, bounces: 0, open_rate: 0, bounce_rate: 0 };
    const replyRate = sentCount === 0 ? 0 : parseFloat(((replyCount / sentCount) * 100).toFixed(1));

    res.json({
      emailsSent: sentCount,
      opens: t.opens,
      openRate: t.open_rate,
      clicks: t.clicks,
      clickRate: t.click_rate,
      bounces: t.bounces,
      bounceRate: t.bounce_rate,
      replies: replyCount,
      replyRate,
      sequence: 'active',
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[metrics] Error:', err);
    res.status(500).json({ error: 'Failed to load metrics' });
  }
});

module.exports = router;