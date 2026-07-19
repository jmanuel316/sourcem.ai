// Outbound sequence webhook dispatch log.
const pool = require('./index');

async function createOutboundSequenceLog({ repId, channel, accountIds, webhookUrl, webhookStatus, responseBody }) {
  const result = await pool.query(
    `INSERT INTO outbound_sequence_log (rep_id, channel, account_ids, webhook_url, webhook_status, response_body)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [repId, channel, accountIds, webhookUrl, webhookStatus, responseBody]
  );
  return result.rows[0];
}

async function getRecentOutboundSequences(repId, { limit = 20 } = {}) {
  const result = await pool.query(
    `SELECT * FROM outbound_sequence_log
     WHERE rep_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [repId, limit]
  );
  return result.rows;
}

async function getLatestSequenceForAccounts(repId, accountIds) {
  if (!Array.isArray(accountIds) || accountIds.length === 0) return [];
  const result = await pool.query(
    `SELECT a.id AS account_id, log.channel, log.webhook_status, log.created_at
     FROM unnest($2::int[]) AS a(id)
     LEFT JOIN LATERAL (
       SELECT channel, webhook_status, created_at
       FROM outbound_sequence_log
       WHERE rep_id = $1 AND account_ids @> ARRAY[a.id]
       ORDER BY created_at DESC LIMIT 1
     ) log ON TRUE`,
    [repId, accountIds]
  );
  return result.rows;
}

async function getSummaryForRep(repId) {
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS total_dispatched,
       COUNT(*) FILTER (WHERE webhook_status >= 200 AND webhook_status < 300)::int AS delivered,
       COUNT(*) FILTER (WHERE webhook_status IS NULL OR webhook_status < 200 OR webhook_status >= 300)::int AS failed
     FROM outbound_sequence_log
     WHERE rep_id = $1`,
    [repId]
  );
  return result.rows[0];
}

module.exports = { createOutboundSequenceLog, getRecentOutboundSequences, getLatestSequenceForAccounts, getSummaryForRep };
