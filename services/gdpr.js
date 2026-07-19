// GDPR export + deletion services.
const pool = require('../db');
const crypto = require('crypto');

async function exportForRep(repId) {
  const data = {};
  data.rep = (await pool.query('SELECT id,name,email,role,created_at FROM reps WHERE id=$1', [repId])).rows[0];
  data.accounts = (await pool.query(
    `SELECT a.* FROM accounts a WHERE a.rep_id = $1 OR a.org_id IN (SELECT company_id FROM reps WHERE id=$1)`,
    [repId])).rows;
  data.signals = (await pool.query(
    `SELECT s.* FROM signals s WHERE s.account_id IN (SELECT id FROM accounts WHERE rep_id=$1)`,
    [repId])).rows;
  data.notifications = (await pool.query('SELECT * FROM notifications WHERE rep_id=$1', [repId])).rows;
  return data;
}

async function softDeleteRep(repId) {
  await pool.query('UPDATE reps SET is_active=FALSE, email=email || \'.deleted\' WHERE id=$1', [repId]);
  // Schedule hard delete in 7 days.
  await pool.query(
    `INSERT INTO gdpr_deletion_jobs (rep_id, scheduled_for) VALUES ($1, NOW() + INTERVAL '7 days')`,
    [repId]
  );
}

async function deleteOrg(orgId) {
  await pool.query('UPDATE reps SET is_active=FALSE WHERE org_id=$1', [orgId]);
  await pool.query(
    `INSERT INTO gdpr_deletion_jobs (org_id, scheduled_for) VALUES ($1, NOW() + INTERVAL '7 days')`,
    [orgId]
  );
}

function signedDownloadToken(payload) {
  const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production';
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

module.exports = { exportForRep, softDeleteRep, deleteOrg, signedDownloadToken };
