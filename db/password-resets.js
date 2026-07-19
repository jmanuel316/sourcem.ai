// Short-lived, one-shot password reset tokens for rep recovery.
const crypto = require('crypto');
const pool = require('./index');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createResetToken(repId) {
  const token = generateToken();
  await pool.query(
    `INSERT INTO password_reset_tokens (token, rep_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [token, repId]
  );
  return token;
}

async function getResetToken(token) {
  if (!token) return null;
  const result = await pool.query(
    `SELECT t.token, t.expires_at, t.rep_id, t.used_at, r.email
     FROM password_reset_tokens t
     JOIN reps r ON r.id = t.rep_id
     WHERE t.token = $1 AND t.expires_at > NOW() AND t.used_at IS NULL`,
    [token]
  );
  return result.rows[0] || null;
}

async function markUsed(token) {
  await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1', [token]);
}

module.exports = { generateToken, createResetToken, getResetToken, markUsed };
