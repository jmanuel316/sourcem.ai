// Digest batch + entry query module.
const pool = require('./index');

async function getOrCreateBatch(repId, batchDate) {
  const result = await pool.query(
    `INSERT INTO digest_batches (rep_id, batch_date, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (rep_id, batch_date) DO UPDATE SET status = 'pending'
     RETURNING *`,
    [repId, batchDate]
  );
  return result.rows[0];
}

async function getBatchByDate(repId, batchDate) {
  const result = await pool.query(
    'SELECT * FROM digest_batches WHERE rep_id = $1 AND batch_date = $2',
    [repId, batchDate]
  );
  return result.rows[0] || null;
}

async function getBatchById(batchId) {
  const result = await pool.query('SELECT * FROM digest_batches WHERE id = $1', [batchId]);
  return result.rows[0] || null;
}

async function getEntryById(entryId) {
  const result = await pool.query('SELECT * FROM digest_entries WHERE id = $1', [entryId]);
  return result.rows[0] || null;
}

async function getTodaysDigest(repId) {
  const result = await pool.query(
    `SELECT db.*,
            json_agg(
              json_build_object(
                'id', de.id,
                'account_id', de.account_id,
                'company_name', a.company_name,
                'domain', a.domain,
                'contact_id', de.contact_id,
                'contact_name', c.name,
                'contact_title', c.title,
                'contact_email', c.email,
                'score', de.score,
                'priority', de.priority,
                'why_one_liner', de.why_one_liner,
                'recommended_action', de.recommended_action,
                'action_status', de.action_status
              ) ORDER BY de.score DESC
            ) FILTER (WHERE de.id IS NOT NULL) as entries
     FROM digest_batches db
     LEFT JOIN digest_entries de ON de.batch_id = db.id
     LEFT JOIN accounts a ON a.id = de.account_id
     LEFT JOIN contacts c ON c.id = de.contact_id
     WHERE db.rep_id = $1 AND db.batch_date = CURRENT_DATE
     GROUP BY db.id
     ORDER BY db.created_at DESC LIMIT 1`,
    [repId]
  );
  return result.rows[0] || null;
}

async function insertEntries(batchId, entries) {
  if (!entries.length) return [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    for (const e of entries) {
      const result = await client.query(
        `INSERT INTO digest_entries (batch_id, account_id, contact_id, score, priority, why_one_liner, recommended_action)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [batchId, e.account_id, e.contact_id || null, e.score, e.priority || 'medium', e.why_one_liner, e.recommended_action]
      );
      inserted.push(result.rows[0]);
    }
    await client.query('COMMIT');
    return inserted;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function markEntryActioned(entryId, status = 'actioned') {
  const result = await pool.query(
    `UPDATE digest_entries SET action_status = $1, actioned_at = NOW() WHERE id = $2 RETURNING *`,
    [status, entryId]
  );
  return result.rows[0] || null;
}

async function publishBatch(batchId) {
  const result = await pool.query(
    `UPDATE digest_batches SET status = 'published', push_sent_at = NOW() WHERE id = $1 RETURNING *`,
    [batchId]
  );
  return result.rows[0] || null;
}

async function getPushSubscriptions(repId) {
  const result = await pool.query(
    'SELECT * FROM push_subscriptions WHERE rep_id = $1 AND is_active = TRUE',
    [repId]
  );
  return result.rows;
}

async function upsertPushSubscription(repId, { endpoint, p256dh, auth }) {
  const result = await pool.query(
    `INSERT INTO push_subscriptions (rep_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (rep_id, endpoint) DO UPDATE SET is_active = TRUE
     RETURNING *`,
    [repId, endpoint, p256dh, auth]
  );
  return result.rows[0];
}

module.exports = {
  getOrCreateBatch, getBatchByDate, getBatchById, getEntryById, getTodaysDigest,
  insertEntries, markEntryActioned, publishBatch,
  getPushSubscriptions, upsertPushSubscription,
};