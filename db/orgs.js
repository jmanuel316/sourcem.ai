// Org query module.
const pool = require('./index');

async function createOrg({ name, billing_email }) {
  const result = await pool.query(
    `INSERT INTO orgs (name, billing_email) VALUES ($1, $2) RETURNING *`,
    [name, billing_email]
  );
  return result.rows[0];
}

async function getOrg(id) {
  const result = await pool.query('SELECT * FROM orgs WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getOrgByName(name) {
  const result = await pool.query('SELECT * FROM orgs WHERE LOWER(name) = LOWER($1)', [name]);
  return result.rows[0] || null;
}

async function updateOrg(id, data) {
  const fields = [];
  const vals = [];
  let i = 1;
  for (const f of ['name', 'billing_email', 'manager_id']) {
    if (data[f] !== undefined) { fields.push(`${f} = $${i++}`); vals.push(data[f]); }
  }
  if (!fields.length) return getOrg(id);
  fields.push('updated_at = NOW()');
  vals.push(id);
  const result = await pool.query(
    `UPDATE orgs SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, vals
  );
  return result.rows[0] || null;
}

module.exports = { createOrg, getOrg, getOrgByName, updateOrg };
