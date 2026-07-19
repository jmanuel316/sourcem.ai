// Per-rep settings (overrides for webhook URLs, etc.).
const pool = require('./index');

async function getSetting(repId, key) {
  const result = await pool.query(
    `SELECT value FROM rep_settings WHERE rep_id = $1 AND key = $2`,
    [repId, key]
  );
  return result.rows[0] ? result.rows[0].value : null;
}

async function setSetting(repId, key, value) {
  const result = await pool.query(
    `INSERT INTO rep_settings (rep_id, key, value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (rep_id, key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = NOW()
     RETURNING *`,
    [repId, key, value]
  );
  return result.rows[0];
}

module.exports = { getSetting, setSetting };
