// Audit log query module.
const pool = require('./index');

async function record({ org_id, actor_rep_id, action, target_type, target_id, metadata }) {
  await pool.query(
    `INSERT INTO audit_log (org_id, actor_rep_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [org_id || null, actor_rep_id || null, action, target_type || null, target_id ? String(target_id) : null, metadata || null]
  );
}

async function recent(orgId, { limit = 100 } = {}) {
  const result = await pool.query(
    `SELECT al.*, r.name AS actor_name, r.email AS actor_email
     FROM audit_log al LEFT JOIN reps r ON r.id = al.actor_rep_id
     WHERE al.org_id = $1 ORDER BY al.created_at DESC LIMIT $2`,
    [orgId, limit]
  );
  return result.rows;
}

module.exports = { record, recent };
