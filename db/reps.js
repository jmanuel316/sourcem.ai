// Rep query module — CRUD for sales rep records.
const pool = require('./index');

async function getAllReps() {
  const result = await pool.query('SELECT * FROM reps WHERE is_active = TRUE ORDER BY name');
  return result.rows;
}

async function getRepById(id) {
  const result = await pool.query('SELECT * FROM reps WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getRepByEmail(email) {
  const result = await pool.query(
    'SELECT * FROM reps WHERE LOWER(email) = LOWER($1) AND is_active = TRUE',
    [email]
  );
  return result.rows[0] || null;
}

async function createRep({ name, email, role = 'rep', company_id = null }) {
  const result = await pool.query(
    `INSERT INTO reps (name, email, role, company_id) VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, email, role, company_id]
  );
  return result.rows[0];
}

async function upsertRep({ name, email, role }) {
  const result = await pool.query(
    `INSERT INTO reps (name, email, role) VALUES ($1, $2, $3)
     ON CONFLICT (LOWER(email)) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, updated_at = NOW()
     RETURNING *`,
    [name, email, role]
  );
  return result.rows[0];
}

async function updatePassword(repId, hash) {
  const result = await pool.query(
    `UPDATE reps SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [hash, repId]
  );
  return result.rows[0] || null;
}

async function updateRep(id, data) {
  const fields = [];
  const vals = [];
  let i = 1;
  if (data.name !== undefined) { fields.push(`name = $${i++}`); vals.push(data.name); }
  if (data.email !== undefined) { fields.push(`email = $${i++}`); vals.push(data.email); }
  if (data.role !== undefined) { fields.push(`role = $${i++}`); vals.push(data.role); }
  if (data.is_active !== undefined) { fields.push(`is_active = $${i++}`); vals.push(data.is_active); }
  if (!fields.length) return getRepById(id);
  fields.push(`updated_at = NOW()`);
  vals.push(id);
  const result = await pool.query(
    `UPDATE reps SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  return result.rows[0] || null;
}

async function getActiveRepsWithStats() {
  const result = await pool.query(`
    SELECT r.id, r.name, r.email,
           COUNT(DISTINCT a.id) as accounts_assigned,
           COUNT(DISTINCT CASE WHEN de.action_status = 'actioned' AND de.actioned_at >= CURRENT_DATE THEN de.id END) as actioned_today,
           COUNT(DISTINCT CASE WHEN de.action_status = 'scheduled' AND de.actioned_at >= CURRENT_DATE THEN de.id END) as scheduled_today,
           MAX(COALESCE(de.actioned_at, a.updated_at)) as last_active
    FROM reps r
    LEFT JOIN accounts a ON a.rep_id = r.id AND a.is_active = TRUE
    LEFT JOIN digest_entries de ON de.account_id = a.id AND de.actioned_at >= CURRENT_DATE
    WHERE r.is_active = TRUE
    GROUP BY r.id
    ORDER BY r.name`);
  return result.rows;
}

module.exports = { getAllReps, getRepById, getRepByEmail, createRep, upsertRep, updatePassword, updateRep, getActiveRepsWithStats };