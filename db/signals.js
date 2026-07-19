// Signal and signal_score query modules.
const pool = require('./index');

async function insertSignal({ account_id, signal_type, source, source_id, title, description, url, metadata, signal_date }) {
  const result = await pool.query(
    `INSERT INTO signals (account_id, signal_type, source, source_id, title, description, url, metadata, signal_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [account_id, signal_type, source, source_id, title, description, url, metadata || {}, signal_date]
  );
  return result.rows[0];
}

async function getSignalsByAccount(accountId, { limit = 50 } = {}) {
  const result = await pool.query(
    `SELECT * FROM signals WHERE account_id = $1 ORDER BY signal_date DESC LIMIT $2`,
    [accountId, limit]
  );
  return result.rows;
}

async function getRecentSignals({ days = 30, limit = 200 } = {}) {
  const result = await pool.query(
    `SELECT s.*, a.company_name, a.rep_id
     FROM signals s
     JOIN accounts a ON a.id = s.account_id
     WHERE s.signal_date >= NOW() - INTERVAL '${parseInt(days)} days'
     ORDER BY s.signal_date DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function upsertSignalScore({ account_id, score, funding_score, hiring_score, crm_score, news_score, email_score, top_signals }) {
  const result = await pool.query(
    `INSERT INTO signal_scores (account_id, score, funding_score, hiring_score, crm_score, news_score, email_score, top_signals, scoring_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING *`,
    [account_id, score, funding_score || 0, hiring_score || 0, crm_score || 0, news_score || 0, email_score || 0, JSON.stringify(top_signals || [])]
  );
  return result.rows[0];
}

async function getLatestScore(accountId) {
  const result = await pool.query(
    `SELECT * FROM signal_scores WHERE account_id = $1 ORDER BY scoring_run_at DESC LIMIT 1`,
    [accountId]
  );
  return result.rows[0] || null;
}

async function getRankedAccounts({ repId, minScore = 1, limit = 50 } = {}) {
  const result = await pool.query(
    `SELECT a.id, a.company_name, a.domain, a.industry,
            c.id as contact_id, c.name as contact_name, c.title as contact_title, c.email as contact_email,
            ss.score, ss.funding_score, ss.hiring_score, ss.crm_score, ss.news_score, ss.email_score, ss.top_signals,
            ss.scoring_run_at,
            se_eng.sent_count, rep_eng.replies_count, rep_eng.last_reply_date, rep_eng.last_reply_category,
            rep_eng.interested_replies_count, tr_eng.opens, tr_eng.clicks,
            CASE
              WHEN COALESCE(se_eng.sent_count, 0) = 0 THEN NULL
              ELSE COALESCE(rep_eng.replies_count, 0)::numeric / NULLIF(se_eng.sent_count, 0)::numeric
            END AS reply_rate,
            CASE WHEN ss.score >= 5 THEN 'high' WHEN ss.score >= 2 THEN 'medium' ELSE 'low' END as priority
     FROM accounts a
     JOIN reps r ON r.id = a.rep_id AND r.is_active = TRUE
     JOIN LATERAL (
       SELECT score, funding_score, hiring_score, crm_score, news_score, email_score, top_signals, scoring_run_at
       FROM signal_scores WHERE account_id = a.id ORDER BY scoring_run_at DESC LIMIT 1
     ) ss ON TRUE
     LEFT JOIN contacts c ON c.account_id = a.id AND c.is_primary = TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS sent_count
       FROM sent_emails se1
       JOIN prospects p1 ON p1.id = se1.prospect_id
       WHERE lower(regexp_replace(p1.company, '[^a-z0-9]', '', 'gi')) =
             lower(regexp_replace(a.company_name, '[^a-z0-9]', '', 'gi'))
     ) se_eng ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS replies_count,
              COUNT(*) FILTER (WHERE er.category = 'interested')::int AS interested_replies_count,
              MAX(er.created_at) AS last_reply_date,
              (SELECT r2.category FROM replies r2
                JOIN sent_emails se2 ON se2.id = r2.sent_email_id
                JOIN prospects p2 ON p2.id = se2.prospect_id
                WHERE lower(regexp_replace(p2.company, '[^a-z0-9]', '', 'gi')) =
                      lower(regexp_replace(a.company_name, '[^a-z0-9]', '', 'gi'))
                ORDER BY r2.created_at DESC LIMIT 1) AS last_reply_category
       FROM replies er
       JOIN sent_emails se3 ON se3.id = er.sent_email_id
       JOIN prospects p3 ON p3.id = se3.prospect_id
       WHERE lower(regexp_replace(p3.company, '[^a-z0-9]', '', 'gi')) =
             lower(regexp_replace(a.company_name, '[^a-z0-9]', '', 'gi'))
     ) rep_eng ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE ete.event_type = 'open')::int AS opens,
              COUNT(*) FILTER (WHERE ete.event_type = 'click')::int AS clicks
       FROM email_tracking_events ete
       JOIN sent_emails se4 ON se4.id = ete.sent_email_id
       JOIN prospects p4 ON p4.id = se4.prospect_id
       WHERE lower(regexp_replace(p4.company, '[^a-z0-9]', '', 'gi')) =
             lower(regexp_replace(a.company_name, '[^a-z0-9]', '', 'gi'))
     ) tr_eng ON TRUE
     WHERE r.id = $1 AND a.is_active = TRUE AND ss.score >= $2
     ORDER BY ss.score DESC
     LIMIT $3`,
    [repId, minScore, limit]
  );
  return result.rows;
}

async function getRankedAccountsForExport({ repId, minScore = 1, limit = 1000 } = {}) {
  const result = await pool.query(
    `SELECT a.id, a.company_name, a.domain,
            ss.score, ss.funding_score, ss.hiring_score, ss.crm_score, ss.news_score, ss.email_score,
            ls.d as last_signal_date,
            se_eng.sent_count, rep_eng.replies_count, rep_eng.last_reply_date,
            CASE
              WHEN COALESCE(se_eng.sent_count, 0) = 0 THEN NULL
              ELSE COALESCE(rep_eng.replies_count, 0)::numeric / NULLIF(se_eng.sent_count, 0)::numeric
            END AS reply_rate,
            CASE
              WHEN ss.funding_score >= GREATEST(ss.hiring_score, ss.crm_score, ss.news_score, ss.email_score)
                AND ss.funding_score > 0 THEN 'funding'
              WHEN ss.hiring_score >= GREATEST(ss.funding_score, ss.crm_score, ss.news_score, ss.email_score)
                AND ss.hiring_score > 0 THEN 'hiring'
              WHEN ss.crm_score >= GREATEST(ss.funding_score, ss.hiring_score, ss.news_score, ss.email_score)
                AND ss.crm_score > 0 THEN 'crm_activity'
              WHEN ss.news_score >= GREATEST(ss.funding_score, ss.hiring_score, ss.crm_score, ss.email_score)
                AND ss.news_score > 0 THEN 'news'
              WHEN ss.email_score >= GREATEST(ss.funding_score, ss.hiring_score, ss.crm_score, ss.news_score)
                AND ss.email_score > 0 THEN 'email'
              ELSE 'mixed'
            END as top_signal_source
     FROM accounts a
     JOIN reps r ON r.id = a.rep_id AND r.is_active = TRUE
     JOIN LATERAL (
       SELECT score, funding_score, hiring_score, crm_score, news_score, email_score
       FROM signal_scores WHERE account_id = a.id ORDER BY scoring_run_at DESC LIMIT 1
     ) ss ON TRUE
     LEFT JOIN LATERAL (
       SELECT MAX(signal_date) AS d FROM signals WHERE account_id = a.id
     ) ls ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS sent_count
       FROM sent_emails se1
       JOIN prospects p1 ON p1.id = se1.prospect_id
       WHERE lower(regexp_replace(p1.company, '[^a-z0-9]', '', 'gi')) =
             lower(regexp_replace(a.company_name, '[^a-z0-9]', '', 'gi'))
     ) se_eng ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS replies_count,
              MAX(er.created_at) AS last_reply_date
       FROM replies er
       JOIN sent_emails se2 ON se2.id = er.sent_email_id
       JOIN prospects p2 ON p2.id = se2.prospect_id
       WHERE lower(regexp_replace(p2.company, '[^a-z0-9]', '', 'gi')) =
             lower(regexp_replace(a.company_name, '[^a-z0-9]', '', 'gi'))
     ) rep_eng ON TRUE
     WHERE r.id = $1 AND a.is_active = TRUE AND ss.score >= $2
     ORDER BY ss.score DESC
     LIMIT $3`,
    [repId, minScore, limit]
  );
  return result.rows;
}

async function getSignalBreakdown({ days = 7 } = {}) {
  const result = await pool.query(`
    SELECT signal_type, COUNT(*) as count
    FROM signals
    WHERE signal_date >= NOW() - INTERVAL '${parseInt(days)} days'
    GROUP BY signal_type
    ORDER BY count DESC`);
  return result.rows;
}

module.exports = { insertSignal, getSignalsByAccount, getRecentSignals, upsertSignalScore, getLatestScore, getRankedAccounts, getRankedAccountsForExport, getSignalBreakdown };