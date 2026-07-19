// A/B test event queries — wraps ab_test_events table.
const pool = require('./index');

async function trackEvent({ experiment, variant, event, visitorId }) {
  await pool.query(
    `INSERT INTO ab_test_events (experiment, variant, event, visitor_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (experiment, variant, event, visitor_id) DO NOTHING`,
    [experiment, variant, event, visitorId || null]
  );
}

async function getResults(experiment = 'hero-headline') {
  const { rows } = await pool.query(
    `SELECT variant, event, COUNT(*) as count
     FROM ab_test_events
     WHERE experiment = $1
     GROUP BY variant, event
     ORDER BY variant, event`,
    [experiment]
  );
  const byVariant = {};
  for (const row of rows) {
    if (!byVariant[row.variant]) byVariant[row.variant] = {};
    byVariant[row.variant][row.event] = parseInt(row.count, 10);
  }
  return Object.entries(byVariant).map(([variant, events]) => {
    const impressions = events.impression || 0;
    const clicks = events.cta_click || 0;
    const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) + '%' : 'n/a';
    return { variant, impressions, clicks, ctr };
  });
}

module.exports = { trackEvent, getResults };