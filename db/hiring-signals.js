const pool = require('./index');

async function upsertHiringSignal({ company_name, role_title, seniority, posted_date, source_url, raw_json }) {
  const result = await pool.query(
    `INSERT INTO hiring_signals (company_name, role_title, seniority, posted_date, source_url, raw_json)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_url) DO NOTHING
     RETURNING *`,
    [company_name, role_title, seniority, posted_date, source_url, raw_json]
  );
  return result.rows[0] || null;
}

async function getRecentHiringSignals({ days = 90, limit = 200 } = {}) {
  const result = await pool.query(
    `SELECT * FROM hiring_signals
     WHERE posted_date >= NOW() - INTERVAL '${parseInt(days)} days'
     ORDER BY posted_date DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

module.exports = { upsertHiringSignal, getRecentHiringSignals };
