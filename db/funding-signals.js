const pool = require('./index');

async function upsertFundingSignal({ company_name, funding_type, amount_usd, announced_date, crunchbase_uuid, raw_json }) {
  const result = await pool.query(
    `INSERT INTO funding_signals (company_name, funding_type, amount_usd, announced_date, crunchbase_uuid, raw_json)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (crunchbase_uuid) DO NOTHING
     RETURNING *`,
    [company_name, funding_type, amount_usd, announced_date, crunchbase_uuid, raw_json]
  );
  return result.rows[0] || null;
}

async function getRecentFundingSignals({ days = 90, limit = 200 } = {}) {
  const result = await pool.query(
    `SELECT * FROM funding_signals
     WHERE announced_date >= NOW() - INTERVAL '${parseInt(days)} days'
     ORDER BY announced_date DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

module.exports = { upsertFundingSignal, getRecentFundingSignals };
