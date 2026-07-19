// A/B test tracking — records impressions and click-throughs, serves results.
const express = require('express');
const router = express.Router();
const pool = require('../db');

// POST /api/ab-track  body: { experiment, variant, event, visitor_id }
router.post('/track', async (req, res) => {
  const { experiment, variant, event, visitor_id } = req.body;
  if (!experiment || !variant || !event) {
    return res.status(400).json({ error: 'experiment, variant, and event are required' });
  }
  if (!['impression', 'cta_click'].includes(event)) {
    return res.status(400).json({ error: 'event must be impression or cta_click' });
  }
  try {
    await pool.query(
      `INSERT INTO ab_test_events (experiment, variant, event, visitor_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (experiment, variant, event, visitor_id) DO NOTHING`,
      [experiment, variant, event, visitor_id || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[ab-test] track error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/ab-test/results  ?experiment=hero-headline
router.get('/results', async (req, res) => {
  const experiment = req.query.experiment || 'hero-headline';
  try {
    const rows = await pool.query(
      `SELECT variant, event, COUNT(*) as count
       FROM ab_test_events
       WHERE experiment = $1
       GROUP BY variant, event
       ORDER BY variant, event`,
      [experiment]
    );

    const byVariant = {};
    for (const row of rows.rows) {
      if (!byVariant[row.variant]) byVariant[row.variant] = {};
      byVariant[row.variant][row.event] = parseInt(row.count, 10);
    }

    const results = Object.entries(byVariant).map(([variant, events]) => {
      const impressions = events.impression || 0;
      const clicks = events.cta_click || 0;
      const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) + '%' : 'n/a';
      return { variant, impressions, clicks, ctr };
    });

    res.json({ experiment, results });
  } catch (err) {
    console.error('[ab-test] results error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;