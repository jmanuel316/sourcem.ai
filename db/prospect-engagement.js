// Engagement scoring: open/click tracking events + reply intent → integer score per prospect.
// Score values: open=1, click=2, interested_reply=3 (additive, capped reasoning kept in breakdown).
const pool = require('./index');

async function computeEngagementScore(prospectId) {
  // Count open and click events across all sent emails for this prospect
  const trackingResult = await pool.query(
    `SELECT
       SUM(CASE WHEN ete.event_type = 'open' THEN 1 ELSE 0 END) AS opens,
       SUM(CASE WHEN ete.event_type = 'click' THEN 1 ELSE 0 END) AS clicks
     FROM email_tracking_events ete
     JOIN sent_emails se ON se.id = ete.sent_email_id
     WHERE se.prospect_id = $1`,
    [prospectId]
  );

  const replyResult = await pool.query(
    `SELECT r.category FROM replies r
     JOIN sent_emails se ON se.id = r.sent_email_id
     WHERE se.prospect_id = $1
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [prospectId]
  );

  const opens = parseInt(trackingResult.rows[0].opens, 10) || 0;
  const clicks = parseInt(trackingResult.rows[0].clicks, 10) || 0;
  const replyCategory = replyResult.rows[0]?.category || null;

  let score = 0;
  if (opens > 0) score += 1;
  if (clicks > 0) score += 2;
  if (replyCategory === 'interested') score += 3;
  // Compounding: extra open or click sessions add more weight
  if (opens > 1) score += Math.min(opens - 1, 2);
  if (clicks > 1) score += Math.min(clicks - 1, 1);

  return score;
}

async function getProspectEngagementDetails(prospectId) {
  const trackingResult = await pool.query(
    `SELECT
       SUM(CASE WHEN ete.event_type = 'open' THEN 1 ELSE 0 END) AS opens,
       SUM(CASE WHEN ete.event_type = 'click' THEN 1 ELSE 0 END) AS clicks
     FROM email_tracking_events ete
     JOIN sent_emails se ON se.id = ete.sent_email_id
     WHERE se.prospect_id = $1`,
    [prospectId]
  );

  const replyResult = await pool.query(
    `SELECT r.category FROM replies r
     JOIN sent_emails se ON se.id = r.sent_email_id
     WHERE se.prospect_id = $1
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [prospectId]
  );

  const opens = parseInt(trackingResult.rows[0].opens, 10) || 0;
  const clicks = parseInt(trackingResult.rows[0].clicks, 10) || 0;
  const replyCategory = replyResult.rows[0]?.category || null;
  const hasReply = replyCategory !== null;

  let score = 0;
  if (opens > 0) score += 1;
  if (clicks > 0) score += 2;
  if (replyCategory === 'interested') score += 3;
  if (opens > 1) score += Math.min(opens - 1, 2);
  if (clicks > 1) score += Math.min(clicks - 1, 1);

  return { opens, clicks, has_reply: hasReply, reply_category: replyCategory, score };
}

// Increment engagement score by a fixed amount for a single event — used by tracking routes
// for lightweight incremental updates without a full recompute.
async function addEngagementPoint(prospectId, eventType) {
  const points = eventType === 'click' ? 1 : 1; // open or click each add 1 incremental point
  await pool.query(
    `UPDATE prospects SET engagement_score = engagement_score + $1, updated_at = NOW() WHERE id = $2`,
    [points, prospectId]
  );
}

// Per-account engagement summary across all matching prospects.
// Joins accounts → prospects by normalized company_name (same match signal-scorer.js uses),
// then aggregates sent_emails, replies, and email_tracking_events.
// One row per active account; accounts with no outreach yield zeros / nulls.
async function getEmailEngagementSummaryByAccount(repId) {
  const result = await pool.query(
    `SELECT a.id AS account_id,
            COALESCE(SUM(se.cnt), 0)::int AS sent_count,
            COALESCE(SUM(rep.cnt), 0)::int AS replies_count,
            CASE
              WHEN COALESCE(SUM(se.cnt), 0) = 0 THEN NULL
              ELSE COALESCE(SUM(rep.cnt), 0)::numeric / NULLIF(SUM(se.cnt), 0)::numeric
            END AS reply_rate,
            MAX(rep.last_reply_date) AS last_reply_date,
            (
              SELECT r.category FROM replies r
              JOIN sent_emails se2 ON se2.id = r.sent_email_id
              JOIN prospects p2 ON p2.id = se2.prospect_id
              WHERE lower(regexp_replace(p2.company, '[^a-z0-9]', '', 'gi')) =
                    lower(regexp_replace(a.company_name, '[^a-z0-9]', '', 'gi'))
              ORDER BY r.created_at DESC LIMIT 1
            ) AS last_reply_category,
            COALESCE(SUM(rep.interested_cnt), 0)::int AS interested_replies_count,
            COALESCE(SUM(tr.opens), 0)::int AS opens,
            COALESCE(SUM(tr.clicks), 0)::int AS clicks
     FROM accounts a
     JOIN reps rep_r ON rep_r.id = a.rep_id AND rep_r.is_active = TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS cnt
       FROM sent_emails se
       JOIN prospects p ON p.id = se.prospect_id
       WHERE lower(regexp_replace(p.company, '[^a-z0-9]', '', 'gi')) =
             lower(regexp_replace(a.company_name, '[^a-z0-9]', '', 'gi'))
     ) se ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS cnt,
              COUNT(*) FILTER (WHERE r2.category = 'interested') AS interested_cnt,
              MAX(r2.created_at) AS last_reply_date
       FROM replies r2
       JOIN sent_emails se3 ON se3.id = r2.sent_email_id
       JOIN prospects p3 ON p3.id = se3.prospect_id
       WHERE lower(regexp_replace(p3.company, '[^a-z0-9]', '', 'gi')) =
             lower(regexp_replace(a.company_name, '[^a-z0-9]', '', 'gi'))
     ) rep ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE ete.event_type = 'open') AS opens,
              COUNT(*) FILTER (WHERE ete.event_type = 'click') AS clicks
       FROM email_tracking_events ete
       JOIN sent_emails se4 ON se4.id = ete.sent_email_id
       JOIN prospects p4 ON p4.id = se4.prospect_id
       WHERE lower(regexp_replace(p4.company, '[^a-z0-9]', '', 'gi')) =
             lower(regexp_replace(a.company_name, '[^a-z0-9]', '', 'gi'))
     ) tr ON TRUE
     WHERE rep_r.id = $1 AND a.is_active = TRUE
     GROUP BY a.id, a.company_name`,
    [repId]
  );
  return result.rows;
}

module.exports = {
  computeEngagementScore,
  getProspectEngagementDetails,
  addEngagementPoint,
  getEmailEngagementSummaryByAccount,
};
