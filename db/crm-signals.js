const pool = require('./index');

async function upsertCrmSignal({ company_id, crm_type, account_name, deal_id, signal_type, signal_date, raw_json }) {
  const result = await pool.query(
    `INSERT INTO crm_signals (company_id, crm_type, account_name, deal_id, signal_type, signal_date, raw_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (company_id, deal_id, signal_type) DO NOTHING
     RETURNING *`,
    [company_id, crm_type, account_name, deal_id, signal_type, signal_date, raw_json]
  );
  return result.rows[0] || null;
}

async function getRecentCrmSignals({ days = 30, limit = 200 } = {}) {
  const result = await pool.query(
    `SELECT * FROM crm_signals
     WHERE ingested_at >= NOW() - INTERVAL '${parseInt(days)} days'
     ORDER BY ingested_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

module.exports = { upsertCrmSignal, getRecentCrmSignals };
