// Reply queries.
const pool = require('./index');

async function createReply(data) {
  const { sent_email_id, inbound_email_id, category, ai_categorization, crm_route_target } = data;
  const result = await pool.query(
    `INSERT INTO replies (sent_email_id, inbound_email_id, category, ai_categorization, crm_route_target)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [sent_email_id, inbound_email_id || null, category, ai_categorization || null, crm_route_target || null]
  );
  return result.rows[0];
}

async function getRepliesByCategory(category, limit = 100) {
  const result = await pool.query(
    'SELECT * FROM replies WHERE category = $1 ORDER BY created_at DESC LIMIT $2',
    [category, limit]
  );
  return result.rows;
}

async function getUnroutedReplies() {
  const result = await pool.query(
    'SELECT * FROM replies WHERE crm_routed = false ORDER BY created_at LIMIT 100'
  );
  return result.rows;
}

async function markRouted(id, target) {
  const result = await pool.query(
    `UPDATE replies SET crm_routed = true, crm_route_target = $1, routed_at = NOW()
     WHERE id = $2 RETURNING *`,
    [target, id]
  );
  return result.rows[0];
}

async function updateReplyCategory(id, category, ai_categorization) {
  const result = await pool.query(
    `UPDATE replies SET category = $1, ai_categorization = $2 WHERE id = $3 RETURNING *`,
    [category, ai_categorization, id]
  );
  return result.rows[0];
}

async function getTotalReplyCount() {
  const result = await pool.query('SELECT COUNT(*) as count FROM replies');
  return parseInt(result.rows[0].count, 10);
}

module.exports = {
  createReply,
  getRepliesByCategory,
  getUnroutedReplies,
  markRouted,
  updateReplyCategory,
  getTotalReplyCount,
};