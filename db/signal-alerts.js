// signal_alerts query module — deduplication + history for in-app / push alerts.
const pool = require('./index');

async function insertAlert({ account_id, rep_id, signal_type, score_at_send }) {
  const result = await pool.query(
    `INSERT INTO signal_alerts (account_id, rep_id, signal_type, score_at_send)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [account_id, rep_id, signal_type, score_at_send]
  );
  return result.rows[0];
}

async function getRecentAlertInWindow(accountId, signalType, windowMinutes = 60) {
  const result = await pool.query(
    `SELECT * FROM signal_alerts
     WHERE account_id = $1 AND signal_type = $2
       AND sent_at >= NOW() - ($3::text || ' minutes')::interval
     ORDER BY sent_at DESC LIMIT 1`,
    [accountId, signalType, String(windowMinutes)]
  );
  return result.rows[0] || null;
}

async function getRecentAlertsForRep(repId, { hours = 24, limit = 50 } = {}) {
  const result = await pool.query(
    `SELECT sa.id, sa.account_id, sa.signal_type, sa.score_at_send, sa.read, sa.sent_at,
            a.company_name
     FROM signal_alerts sa
     JOIN accounts a ON a.id = sa.account_id
     WHERE sa.rep_id = $1
       AND sa.sent_at >= NOW() - ($2::text || ' hours')::interval
     ORDER BY sa.sent_at DESC
     LIMIT $3`,
    [repId, String(hours), limit]
  );
  return result.rows;
}

async function getUnreadAlertCount(repId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int as count FROM signal_alerts WHERE rep_id = $1 AND read = FALSE`,
    [repId]
  );
  return result.rows[0].count || 0;
}

async function markAlertsRead(repId, alertIds) {
  if (!Array.isArray(alertIds) || alertIds.length === 0) return 0;
  const result = await pool.query(
    `UPDATE signal_alerts SET read = TRUE
     WHERE rep_id = $1 AND id = ANY($2::int[])`,
    [repId, alertIds]
  );
  return result.rowCount || 0;
}

module.exports = {
  insertAlert,
  getRecentAlertInWindow,
  getRecentAlertsForRep,
  getUnreadAlertCount,
  markAlertsRead,
};
