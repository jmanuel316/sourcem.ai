// Prospect queries.
const pool = require('./index');

async function getProspectsByStatus(status, limit = 100) {
  const result = await pool.query(
    'SELECT * FROM prospects WHERE status = $1 ORDER BY created_at LIMIT $2',
    [status, limit]
  );
  return result.rows;
}

async function getUncontactedProspects(campaignId, limit = 50) {
  const result = await pool.query(
    `SELECT p.* FROM prospects p
     WHERE p.status = 'uncontacted'
     AND NOT EXISTS (
       SELECT 1 FROM sent_emails se WHERE se.prospect_id = p.id AND se.campaign_id = $1
     )
     ORDER BY p.engagement_score DESC, p.created_at LIMIT $2`,
    [campaignId, limit]
  );
  return result.rows;
}

async function getProspectsByCampaign(campaignId) {
  const result = await pool.query(
    `SELECT DISTINCT p.* FROM prospects p
     JOIN sent_emails se ON se.prospect_id = p.id
     WHERE se.campaign_id = $1`,
    [campaignId]
  );
  return result.rows;
}

async function updateProspectEngagementScore(id, score) {
  const result = await pool.query(
    'UPDATE prospects SET engagement_score = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [score, id]
  );
  return result.rows[0];
}

async function getProspectById(id) {
  const result = await pool.query('SELECT * FROM prospects WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getProspectByEmail(email) {
  const result = await pool.query(
    'SELECT * FROM prospects WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return result.rows[0] || null;
}

async function createProspect(data) {
  const { name, email, company, title, linkedin_url, icp_data, source } = data;
  const result = await pool.query(
    `INSERT INTO prospects (name, email, company, title, linkedin_url, icp_data, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, email, company, title, linkedin_url, icp_data || {}, source || null]
  );
  return result.rows[0];
}

async function upsertProspect(data) {
  const { name, email, company, title, linkedin_url, icp_data, source } = data;
  const result = await pool.query(
    `INSERT INTO prospects (name, email, company, title, linkedin_url, icp_data, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (LOWER(email)) DO UPDATE SET
       name = EXCLUDED.name,
       company = EXCLUDED.company,
       title = EXCLUDED.title,
       linkedin_url = COALESCE(EXCLUDED.linkedin_url, prospects.linkedin_url),
       icp_data = EXCLUDED.icp_data,
       updated_at = NOW()
     RETURNING *`,
    [name, email, company, title, linkedin_url, icp_data || {}, source || null]
  );
  return result.rows[0];
}

async function updateProspectStatus(id, status) {
  const result = await pool.query(
    'UPDATE prospects SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, id]
  );
  return result.rows[0];
}

async function updateProspectIcpData(id, icp_data) {
  const result = await pool.query(
    'UPDATE prospects SET icp_data = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [icp_data, id]
  );
  return result.rows[0];
}

async function bulkCreateProspects(prospects) {
  if (!prospects.length) return [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const p of prospects) {
      const result = await client.query(
        `INSERT INTO prospects (name, email, company, title, linkedin_url, icp_data, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (LOWER(email)) DO UPDATE SET name = EXCLUDED.name, company = EXCLUDED.company, title = EXCLUDED.title, updated_at = NOW()
         RETURNING *`,
        [p.name, p.email, p.company || null, p.title || null, p.linkedin_url || null, p.icp_data || {}, p.source || null]
      );
      created.push(result.rows[0]);
    }
    await client.query('COMMIT');
    return created;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  getProspectsByStatus,
  getUncontactedProspects,
  getProspectsByCampaign,
  getProspectById,
  getProspectByEmail,
  createProspect,
  upsertProspect,
  updateProspectStatus,
  updateProspectIcpData,
  updateProspectEngagementScore,
  bulkCreateProspects,
};