const pool = require('./index');

async function upsertAccountScore({ company_id, rep_id, account_name, contact_name, contact_email, composite_score, signal_types, top_signal_summary, recommended_action, score_date }) {
  const result = await pool.query(
    `INSERT INTO account_scores (company_id, rep_id, account_name, contact_name, contact_email, composite_score, signal_types, top_signal_summary, recommended_action, score_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (company_id, score_date) DO UPDATE SET
       rep_id             = EXCLUDED.rep_id,
       account_name       = EXCLUDED.account_name,
       contact_name       = EXCLUDED.contact_name,
       contact_email      = EXCLUDED.contact_email,
       composite_score    = EXCLUDED.composite_score,
       signal_types       = EXCLUDED.signal_types,
       top_signal_summary = EXCLUDED.top_signal_summary,
       recommended_action = EXCLUDED.recommended_action
     RETURNING *`,
    [company_id, rep_id, account_name, contact_name, contact_email, composite_score, signal_types, top_signal_summary, recommended_action, score_date]
  );
  return result.rows[0];
}

async function clearScoresForDate(score_date) {
  await pool.query('DELETE FROM account_scores WHERE score_date = $1', [score_date]);
}

async function getScoresByRep(rep_id, score_date) {
  const result = await pool.query(
    `SELECT * FROM account_scores
     WHERE rep_id = $1 AND score_date = $2
     ORDER BY composite_score DESC`,
    [rep_id, score_date]
  );
  return result.rows;
}

async function getScoresByDate(score_date) {
  const result = await pool.query(
    `SELECT * FROM account_scores
     WHERE score_date = $1
     ORDER BY composite_score DESC`,
    [score_date]
  );
  return result.rows;
}

async function getTodayOverview() {
  const result = await pool.query(`
    SELECT
      COUNT(DISTINCT id) as total_scored,
      COUNT(DISTINCT CASE WHEN composite_score >= 5 THEN id END) as high_priority
    FROM account_scores
    WHERE score_date = CURRENT_DATE`);

  const actioned = await pool.query(`
    SELECT COUNT(*) as c FROM digest_entries
    WHERE actioned_at >= CURRENT_DATE AND action_status = 'actioned'`);
  const row = result.rows[0];
  row.actioned_today = parseInt(actioned.rows[0].c, 10);
  row.active_reps = await pool.query(`SELECT COUNT(*) as c FROM reps WHERE is_active = TRUE`).then(r => parseInt(r.rows[0].c, 10));
  return row;
}

async function getTopAccountsToday(limit = 10) {
  const result = await pool.query(`
    SELECT ac.id, ac.company_name, r.name as rep_name,
           ss.score, ss.funding_score, ss.hiring_score, ss.crm_score,
           ss.top_signals,
           CASE WHEN ss.score >= 5 THEN 'high' WHEN ss.score >= 2 THEN 'medium' ELSE 'low' END as status
    FROM accounts ac
    JOIN reps r ON r.id = ac.rep_id
    JOIN LATERAL (
      SELECT score, funding_score, hiring_score, crm_score, top_signals
      FROM signal_scores WHERE account_id = ac.id
      ORDER BY scoring_run_at DESC LIMIT 1
    ) ss ON TRUE
    WHERE ac.is_active = TRUE AND ss.score IS NOT NULL
    ORDER BY ss.score DESC
    LIMIT $1`, [limit]);
  return result.rows;
}

module.exports = { upsertAccountScore, clearScoresForDate, getScoresByRep, getScoresByDate, getTodayOverview, getTopAccountsToday };