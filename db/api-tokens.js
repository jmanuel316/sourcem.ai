// API tokens — list, mint, revoke.
const crypto = require('crypto');
const pool = require('./index');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function listForOrg(orgId) {
  const result = await pool.query(
    `SELECT id, label, scopes, created_at, last_used_at, revoked_at
     FROM api_tokens WHERE org_id = $1 ORDER BY created_at DESC`,
    [orgId]
  );
  return result.rows;
}

async function mint({ org_id, label = 'Token', scopes = [] }) {
  const raw = crypto.randomBytes(24).toString('base64url');
  const token = `smai_${raw}`;
  await pool.query(
    `INSERT INTO api_tokens (org_id, token_hash, label, scopes) VALUES ($1, $2, $3, $4)`,
    [org_id, sha256(token), label, scopes]
  );
  return { token, label, scopes };
}

async function revoke(orgId, id) {
  await pool.query(
    `UPDATE api_tokens SET revoked_at = NOW() WHERE id = $1 AND org_id = $2`,
    [id, orgId]
  );
}

async function findByToken(raw) {
  if (!raw || !raw.startsWith('smai_')) return null;
  const result = await pool.query(
    `SELECT t.*, r.company_id AS rep_org_id FROM api_tokens t
     JOIN reps r ON r.company_id = t.org_id
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL`,
    [sha256(raw)]
  );
  return result.rows[0] || null;
}

module.exports = { listForOrg, mint, revoke, findByToken };
