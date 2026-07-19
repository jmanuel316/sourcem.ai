// Session management for rep auth.
const crypto = require('crypto');
const pool = require('./index');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createSession(repId) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  await pool.query(
    'INSERT INTO rep_sessions (token, rep_id, expires_at) VALUES ($1, $2, $3)',
    [token, repId, expiresAt]
  );
  return token;
}

async function getSession(token) {
  if (!token) return null;
  const result = await pool.query(
    `SELECT s.token, s.expires_at, r.id as rep_id, r.name, r.email, r.role, r.company_id
     FROM rep_sessions s
     JOIN reps r ON r.id = s.rep_id
     WHERE s.token = $1 AND s.expires_at > NOW() AND s.used_at IS NULL`,
    [token]
  );
  return result.rows[0] || null;
}

async function markUsed(token) {
  await pool.query('UPDATE rep_sessions SET used_at = NOW() WHERE token = $1', [token]);
}

async function createPasswordSession(repId) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await pool.query(
    'INSERT INTO rep_sessions (token, rep_id, expires_at) VALUES ($1, $2, $3)',
    [token, repId, expiresAt]
  );
  return token;
}

async function cleanupExpired() {
  await pool.query('DELETE FROM rep_sessions WHERE expires_at < NOW()');
}

module.exports = { createSession, createPasswordSession, getSession, markUsed, cleanupExpired, generateToken };