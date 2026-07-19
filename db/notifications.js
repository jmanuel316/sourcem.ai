// Notifications store (in-app bell + center).
const pool = require('./index');

async function countUnread(repId) {
  const result = await pool.query(
    `SELECT COUNT(*) FROM notifications WHERE rep_id = $1 AND read_at IS NULL`,
    [repId]
  );
  return parseInt(result.rows[0].count, 10);
}

async function listForRep(repId, { limit = 50 } = {}) {
  const result = await pool.query(
    `SELECT * FROM notifications WHERE rep_id = $1 OR rep_id IS NULL
     ORDER BY created_at DESC LIMIT $2`,
    [repId, limit]
  );
  return result.rows;
}

async function create({ org_id, rep_id, type, title, body, link }) {
  const result = await pool.query(
    `INSERT INTO notifications (org_id, rep_id, type, title, body, link)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [org_id || null, rep_id || null, type, title, body || null, link || null]
  );
  return result.rows[0];
}

async function markRead(id, repId) {
  await pool.query(
    `UPDATE notifications SET read_at = NOW() WHERE id = $1 AND rep_id = $2`,
    [id, repId]
  );
}

async function markAllRead(repId) {
  await pool.query(
    `UPDATE notifications SET read_at = NOW() WHERE rep_id = $1 AND read_at IS NULL`,
    [repId]
  );
}

module.exports = { countUnread, listForRep, create, markRead, markAllRead };
