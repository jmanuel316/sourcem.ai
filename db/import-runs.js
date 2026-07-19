// Import-runs bookkeeping.
const pool = require('./index');

async function create({ id, org_id, mode, source, status = 'queued', payload = null, total = 0 }) {
  await pool.query(
    `INSERT INTO import_runs (id, org_id, mode, source, status, payload, row_count, progress, processed_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0)
     ON CONFLICT (id) DO NOTHING`,
    [id, org_id || null, mode, source || null, status, payload ? JSON.stringify(payload) : null, total]
  );
}

async function setProgress(id, { progress, processed_count }) {
  await pool.query(
    `UPDATE import_runs SET progress=$2, processed_count=$3 WHERE id=$1`,
    [id, progress, processed_count]
  );
}

async function complete(id, { row_count, inserted_count, updated_count, error_count, errors = null }) {
  await pool.query(
    `UPDATE import_runs
       SET status='completed', row_count=$2, inserted_count=$3, updated_count=$4, error_count=$5,
           progress=100, processed_count=$2, errors_json=$6
     WHERE id=$1`,
    [id, row_count, inserted_count, updated_count, error_count, errors ? JSON.stringify(errors) : null]
  );
}

async function fail(id, errorMessage) {
  await pool.query(
    `UPDATE import_runs SET status='failed', errors_json=$2 WHERE id=$1`,
    [id, JSON.stringify([{ message: errorMessage }])]
  );
}

async function getForOrg(runId, orgId) {
  const result = await pool.query(
    `SELECT id, org_id, mode, source, status, progress, processed_count, row_count,
            inserted_count, updated_count, error_count, errors_json, created_at
       FROM import_runs WHERE id=$1 AND org_id=$2`,
    [runId, orgId]
  );
  return result.rows[0] || null;
}

async function listQueued(limit = 5) {
  const result = await pool.query(
    `SELECT id, org_id, payload, mode, source FROM import_runs
      WHERE status='queued' ORDER BY id LIMIT $1`,
    [limit]
  );
  return result.rows;
}

module.exports = { create, setProgress, complete, fail, getForOrg, listQueued };
