// Account query module — company accounts + contacts.
const pool = require('./index');

async function getAccountById(id) {
  const result = await pool.query('SELECT * FROM accounts WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getAccountsByRep(repId, { limit = 50, includeInactive = false } = {}) {
  const activeClause = includeInactive ? '' : 'AND a.is_active = TRUE';
  const result = await pool.query(
    `SELECT a.*,
            c.id as primary_contact_id, c.name as primary_contact_name,
            c.title as primary_contact_title, c.email as primary_contact_email,
            ss.score as current_score, ss.priority as current_priority
     FROM accounts a
     LEFT JOIN contacts c ON c.account_id = a.id AND c.is_primary = TRUE
     LEFT JOIN LATERAL (
       SELECT score, 'high' as priority FROM signal_scores
       WHERE account_id = a.id ORDER BY scoring_run_at DESC LIMIT 1
     ) ss ON TRUE
     WHERE a.rep_id = $1 ${activeClause}
     ORDER BY ss.score DESC NULLS LAST, a.created_at DESC
     LIMIT $2`,
    [repId, limit]
  );
  return result.rows;
}

async function upsertAccount({ id, rep_id, company_name, domain, industry, employee_count, annual_revenue, tech_stack, notes, crm_account_id, source }) {
  const result = await pool.query(
    `INSERT INTO accounts (rep_id, company_name, domain, industry, employee_count, annual_revenue, tech_stack, notes, crm_account_id, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [rep_id, company_name, domain, industry, employee_count, annual_revenue, tech_stack || null, notes || null, crm_account_id, source || 'manual']
  );
  return result.rows[0] || null;
}

async function createAccount(data) {
  const { rep_id, company_name, domain, industry, employee_count, annual_revenue, tech_stack, notes, crm_account_id, source } = data;
  const result = await pool.query(
    `INSERT INTO accounts (rep_id, company_name, domain, industry, employee_count, annual_revenue, tech_stack, notes, crm_account_id, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [rep_id, company_name, domain, industry, employee_count, annual_revenue, tech_stack || null, notes || null, crm_account_id, source || 'manual']
  );
  return result.rows[0];
}

async function updateAccount(id, data) {
  const fields = [];
  const vals = [];
  let i = 1;
  const allowed = ['company_name', 'domain', 'industry', 'employee_count', 'annual_revenue', 'tech_stack', 'notes', 'crm_account_id', 'source', 'is_active', 'rep_id'];
  for (const f of allowed) {
    if (data[f] !== undefined) { fields.push(`${f} = $${i++}`); vals.push(data[f]); }
  }
  if (!fields.length) return getAccountById(id);
  fields.push('updated_at = NOW()');
  vals.push(id);
  const result = await pool.query(
    `UPDATE accounts SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, vals
  );
  return result.rows[0] || null;
}

module.exports = { getAccountById, getAccountsByRep, upsertAccount, createAccount, updateAccount };