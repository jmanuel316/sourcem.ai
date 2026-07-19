const pool = require('./index');

async function getConnection(companyId, crmType) {
  const result = await pool.query(
    'SELECT * FROM crm_connections WHERE company_id = $1 AND crm_type = $2',
    [companyId, crmType]
  );
  return result.rows[0] || null;
}

async function getAllConnections(companyId) {
  const result = await pool.query(
    'SELECT * FROM crm_connections WHERE company_id = $1',
    [companyId]
  );
  return result.rows;
}

async function upsertConnection({ company_id, crm_type, access_token, refresh_token, token_expires_at, instance_url = null }) {
  const result = await pool.query(
    `INSERT INTO crm_connections (company_id, crm_type, access_token, refresh_token, token_expires_at, instance_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (company_id, crm_type) DO UPDATE SET
       access_token     = EXCLUDED.access_token,
       refresh_token    = EXCLUDED.refresh_token,
       token_expires_at = EXCLUDED.token_expires_at,
       instance_url     = COALESCE(EXCLUDED.instance_url, crm_connections.instance_url),
       connected_at     = NOW()
     RETURNING *`,
    [company_id, crm_type, access_token, refresh_token, token_expires_at, instance_url]
  );
  return result.rows[0];
}

async function getAllActiveConnections() {
  const result = await pool.query('SELECT * FROM crm_connections');
  return result.rows;
}

async function deleteConnection(companyId, crmType) {
  const result = await pool.query(
    'DELETE FROM crm_connections WHERE company_id = $1 AND crm_type = $2 RETURNING *',
    [companyId, crmType]
  );
  return result.rows[0] || null;
}

module.exports = { getConnection, getAllConnections, getAllActiveConnections, upsertConnection, deleteConnection };
