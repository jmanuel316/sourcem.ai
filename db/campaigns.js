// Campaign queries.
const pool = require('./index');

async function getCampaigns(status) {
  const query = status
    ? 'SELECT * FROM campaigns WHERE status = $1 ORDER BY created_at DESC'
    : 'SELECT * FROM campaigns ORDER BY created_at DESC';
  const result = await pool.query(query, status ? [status] : []);
  return result.rows;
}

async function getCampaignById(id) {
  const result = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getActiveCampaigns() {
  const result = await pool.query(
    "SELECT * FROM campaigns WHERE status = 'active' ORDER BY created_at"
  );
  return result.rows;
}

async function createCampaign(data) {
  const { name, icp_description, email_account_id, daily_limit } = data;
  const result = await pool.query(
    `INSERT INTO campaigns (name, icp_description, email_account_id, daily_limit)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, icp_description, email_account_id || null, daily_limit || 30]
  );
  return result.rows[0];
}

async function updateCampaignStatus(id, status) {
  const result = await pool.query(
    'UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, id]
  );
  return result.rows[0];
}

async function updateCampaignDailyLimit(id, daily_limit) {
  const result = await pool.query(
    'UPDATE campaigns SET daily_limit = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [daily_limit, id]
  );
  return result.rows[0];
}

async function getCampaignsSentToday(campaignId) {
  const result = await pool.query(
    `SELECT COUNT(*) FROM sent_emails
     WHERE campaign_id = $1 AND sent_at > CURRENT_DATE`,
    [campaignId]
  );
  return parseInt(result.rows[0].count, 10);
}

module.exports = {
  getCampaigns,
  getCampaignById,
  getActiveCampaigns,
  createCampaign,
  updateCampaignStatus,
  updateCampaignDailyLimit,
  getCampaignsSentToday,
};