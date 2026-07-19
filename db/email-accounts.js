// Email account queries.
const pool = require('./index');

async function getEmailAccounts() {
  const result = await pool.query('SELECT * FROM email_accounts ORDER BY is_primary DESC, created_at');
  return result.rows;
}

async function getPrimaryEmailAccount() {
  const result = await pool.query(
    'SELECT * FROM email_accounts WHERE is_primary = true LIMIT 1'
  );
  return result.rows[0] || null;
}

async function getEmailAccountById(id) {
  const result = await pool.query('SELECT * FROM email_accounts WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createEmailAccount(data) {
  const { email_address, display_name, is_primary } = data;
  const result = await pool.query(
    `INSERT INTO email_accounts (email_address, display_name, is_primary)
     VALUES ($1, $2, $3) RETURNING *`,
    [email_address, display_name || email_address, is_primary || false]
  );
  return result.rows[0];
}

async function setPrimaryEmailAccount(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE email_accounts SET is_primary = false');
    await client.query('UPDATE email_accounts SET is_primary = true WHERE id = $1', [id]);
    await client.query('COMMIT');
    return getEmailAccountById(id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function incrementWarmupCount(id) {
  const result = await pool.query(
    `UPDATE email_accounts
     SET warmup_daily_count = warmup_daily_count + 1,
         warmup_last_reset = CASE WHEN warmup_last_reset < CURRENT_DATE THEN CURRENT_DATE ELSE warmup_last_reset END
     WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

async function resetWarmupCounts() {
  const result = await pool.query(
    `UPDATE email_accounts
     SET warmup_daily_count = 0,
         warmup_last_reset = NOW()
     WHERE warmup_last_reset < CURRENT_DATE OR warmup_daily_count > 0`
  );
}

async function getNextWarmupAccount(limit = 3) {
  const result = await pool.query(
    `SELECT * FROM email_accounts
     WHERE warmup_enabled = true
     AND (warmup_last_reset < CURRENT_DATE OR warmup_daily_count < $1)
     ORDER BY warmup_daily_count ASC, is_primary DESC
     LIMIT $2`,
    [limit, limit]
  );
  return result.rows;
}

module.exports = {
  getEmailAccounts,
  getPrimaryEmailAccount,
  getEmailAccountById,
  createEmailAccount,
  setPrimaryEmailAccount,
  incrementWarmupCount,
  resetWarmupCounts,
  getNextWarmupAccount,
};