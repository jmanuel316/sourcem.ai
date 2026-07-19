// Email tracking event queries.
const pool = require('./index');

async function recordEvent({ sentEmailId, eventType, eventData, ipAddress, userAgent }) {
  const result = await pool.query(
    `INSERT INTO email_tracking_events (sent_email_id, event_type, event_data, ip_address, user_agent)
     VALUES ($1, $2, $3, $4::inet, $5)
     ON CONFLICT DO NOTHING RETURNING *`,
    [sentEmailId, eventType, JSON.stringify(eventData || {}), ipAddress || null, userAgent || null]
  );
  return result.rows[0];
}

async function getEventCounts(campaignId) {
  const result = await pool.query(
    `SELECT
       event_type,
       COUNT(*) as count
     FROM email_tracking_events et
     JOIN sent_emails se ON et.sent_email_id = se.id
     WHERE se.campaign_id = $1
     GROUP BY event_type`,
    [campaignId]
  );
  return result.rows;
}

async function getAggregatedMetrics() {
  const result = await pool.query(
    `WITH totals AS (
       SELECT
         COUNT(DISTINCT se.id) FILTER (WHERE se.campaign_id IS NOT NULL) as total_sent,
         COUNT(DISTINCT se.id) as total_sent_all,
         COUNT(DISTINCT et.id) FILTER (WHERE et.event_type = 'open') as total_opens,
         COUNT(DISTINCT et.id) FILTER (WHERE et.event_type = 'click') as total_clicks,
         COUNT(DISTINCT et.id) FILTER (WHERE et.event_type = 'bounce') as total_bounces
       FROM sent_emails se
       LEFT JOIN email_tracking_events et ON et.sent_email_id = se.id
     )
     SELECT
       total_sent_all as emails_sent,
       COALESCE(total_opens, 0) as opens,
       COALESCE(total_clicks, 0) as clicks,
       COALESCE(total_bounces, 0) as bounces,
       CASE WHEN total_sent_all > 0 THEN ROUND((COALESCE(total_opens, 0)::numeric / total_sent_all) * 100, 1) ELSE 0 END as open_rate,
       CASE WHEN total_sent_all > 0 THEN ROUND((COALESCE(total_clicks, 0)::numeric / total_sent_all) * 100, 1) ELSE 0 END as click_rate,
       CASE WHEN total_sent_all > 0 THEN ROUND((COALESCE(total_bounces, 0)::numeric / total_sent_all) * 100, 1) ELSE 0 END as bounce_rate
     FROM totals`
  );
  return result.rows[0];
}

module.exports = { recordEvent, getEventCounts, getAggregatedMetrics };