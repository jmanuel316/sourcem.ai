// Integrations CRUD + sync log.
const pool = require('./index');

async function getForOrg(orgId, provider) {
  const result = await pool.query(
    'SELECT * FROM integrations WHERE org_id = $1 AND provider = $2',
    [orgId, provider]
  );
  return result.rows[0] || null;
}

async function listForOrg(orgId) {
  const result = await pool.query(
    'SELECT * FROM integrations WHERE org_id = $1 ORDER BY provider',
    [orgId]
  );
  return result.rows;
}

async function upsert({ org_id, provider, status = 'not_configured', config = {}, scopes = [] }) {
  const result = await pool.query(
    `INSERT INTO integrations (org_id, provider, status, config, scopes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (org_id, provider) DO UPDATE SET
       status = EXCLUDED.status,
       config = EXCLUDED.config,
       scopes = EXCLUDED.scopes,
       updated_at = NOW()
     RETURNING *`,
    [org_id, provider, status, config, scopes]
  );
  return result.rows[0];
}

async function setStatus(orgId, provider, status, last_error = null) {
  await pool.query(
    `UPDATE integrations SET status = $3, last_error = $4, updated_at = NOW()
     WHERE org_id = $1 AND provider = $2`,
    [orgId, provider, status, last_error]
  );
}

async function markSynced(orgId, provider, ok, error, duration_ms) {
  const intg = await getForOrg(orgId, provider);
  if (!intg) return;
  await pool.query(
    `UPDATE integrations SET last_synced_at = NOW(), last_error = $3, updated_at = NOW()
     WHERE id = $1`,
    [intg.id, intg.id, ok ? null : error]
  );
  await pool.query(
    `INSERT INTO integration_sync_log (integration_id, ok, error, duration_ms) VALUES ($1, $2, $3, $4)`,
    [intg.id, ok, ok ? null : error, duration_ms]
  );
}

async function disconnect(orgId, provider) {
  await pool.query(
    `DELETE FROM integrations WHERE org_id = $1 AND provider = $2`,
    [orgId, provider]
  );
}

module.exports = { getForOrg, listForOrg, upsert, setStatus, markSynced, disconnect };
