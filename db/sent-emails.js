// Sent email queries.
const pool = require('./index');

async function createSentEmail(data) {
  const { prospect_id, campaign_id, email_account_id, subject, body, ai_generated, polsia_email_id, tracking_uuid, html_body } = data;
  const result = await pool.query(
    `INSERT INTO sent_emails (prospect_id, campaign_id, email_account_id, subject, body, ai_generated, polsia_email_id, tracking_uuid, html_body)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [prospect_id, campaign_id, email_account_id, subject, body, ai_generated !== false, polsia_email_id || null, tracking_uuid || null, html_body || null]
  );
  return result.rows[0];
}

async function getSentEmailsForProspect(prospectId) {
  const result = await pool.query('SELECT * FROM sent_emails WHERE prospect_id = $1 ORDER BY sent_at DESC', [prospectId]);
  return result.rows;
}

async function getSentEmailById(id) {
  const result = await pool.query('SELECT * FROM sent_emails WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getSentEmailByUuid(uuid) {
  const result = await pool.query('SELECT * FROM sent_emails WHERE tracking_uuid = $1', [uuid]);
  return result.rows[0] || null;
}

async function getSentEmailByPolsiaId(polsiaEmailId) {
  const result = await pool.query('SELECT * FROM sent_emails WHERE polsia_email_id = $1 LIMIT 1', [polsiaEmailId]);
  return result.rows[0] || null;
}

async function getSentEmailsByCampaign(campaignId, limit = 100) {
  const result = await pool.query('SELECT * FROM sent_emails WHERE campaign_id = $1 ORDER BY sent_at DESC LIMIT $2', [campaignId, limit]);
  return result.rows;
}

async function getTotalSentCount() {
  const result = await pool.query('SELECT COUNT(*) as count FROM sent_emails');
  return parseInt(result.rows[0].count, 10);
}

async function getReplyMetricsForRep(repId) {
  const result = await pool.query(
    `WITH rep_companies AS (
       SELECT lower(regexp_replace(company_name, '[^a-z0-9]', '', 'gi')) AS norm
       FROM accounts WHERE rep_id = $1 AND is_active = TRUE
     )
     SELECT
       (SELECT COUNT(*)::int FROM sent_emails se
          JOIN prospects p ON p.id = se.prospect_id
        WHERE lower(regexp_replace(p.company, '[^a-z0-9]', '', 'gi')) IN (SELECT norm FROM rep_companies)) AS sent,
       (SELECT COUNT(*)::int FROM replies r
          JOIN sent_emails se ON se.id = r.sent_email_id
          JOIN prospects p ON p.id = se.prospect_id
        WHERE lower(regexp_replace(p.company, '[^a-z0-9]', '', 'gi')) IN (SELECT norm FROM rep_companies)) AS replied`,
    [repId]
  );
  return result.rows[0];
}

module.exports = {
  createSentEmail,
  getSentEmailsForProspect,
  getSentEmailById,
  getSentEmailByUuid,
  getSentEmailByPolsiaId,
  getSentEmailsByCampaign,
  getTotalSentCount,
  getReplyMetricsForRep,
};