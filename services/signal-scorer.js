// Signal scoring engine — computes weighted scores per account.
// Scoring weights: funding=3pts, hiring=2pts, crm_activity=2pts, news=2pts
const pool = require('../db/index');
const { upsertSignalScore, getRecentSignals } = require('../db/signals');

const WEIGHTS = { funding: 3, hiring: 2, crm_activity: 2, news: 2, email: 2 };

async function scoreAllAccounts() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all active accounts
    const accounts = await client.query(
      `SELECT a.id, a.rep_id FROM accounts a
       JOIN reps r ON r.id = a.rep_id AND r.is_active = TRUE
       WHERE a.is_active = TRUE`
    );

    let scored = 0;
    for (const acc of accounts.rows) {
      const result = await scoreAccount(acc.id, client);
      if (result) scored++;
    }

    await client.query('COMMIT');
    return { scored };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function scoreAccount(accountId, client = null) {
  const conn = client || pool;

  // Fetch account metadata for name-based matching against raw signal tables
  const accResult = await conn.query(
    `SELECT company_name, domain FROM accounts WHERE id = $1`,
    [accountId]
  );
  const account = accResult.rows[0];
  const normalizedName = account
    ? `lower(regexp_replace('${account.company_name.replace(/'/g, "''")}', '[^a-z0-9]', '', 'gi'))`
    : null;

  // Query canonical signals table (populated via manual POST /api/signals)
  const sigResult = await conn.query(
    `SELECT signal_type, COUNT(*) as cnt, MAX(signal_date) as latest_date
     FROM signals
     WHERE account_id = $1 AND signal_date >= NOW() - INTERVAL '30 days'
     GROUP BY signal_type`,
    [accountId]
  );

  const scores = { funding: 0, hiring: 0, crm_activity: 0, news: 0 };
  const topSignals = [];

  for (const row of sigResult.rows) {
    const type = row.signal_type;
    if (!WEIGHTS[type]) continue;
    const count = parseInt(row.cnt, 10);
    const weight = WEIGHTS[type];
    scores[type] = Math.min(count * weight, weight * 3);
    topSignals.push({ type, count, latest_date: row.latest_date });
  }

  // Query raw ingestion tables (populated by nightly cron jobs)
  if (account) {
    // funding_signals ingested by ingest-funding-signals cron
    const fResult = await conn.query(
      `SELECT COUNT(*) as cnt FROM funding_signals
       WHERE lower(regexp_replace(company_name, '[^a-z0-9]', '', 'gi')) = lower(regexp_replace($1, '[^a-z0-9]', '', 'gi'))
         AND announced_date >= NOW() - INTERVAL '30 days'`,
      [account.company_name]
    );
    const fCount = Math.min(parseInt(fResult.rows[0].cnt, 10), 3);
    if (fCount > 0) {
      scores.funding += fCount * WEIGHTS.funding;
      topSignals.push({ type: 'funding', count: fCount, source: 'funding_signals' });
    }

    // hiring_signals ingested by ingest-hiring-signals cron
    const hResult = await conn.query(
      `SELECT COUNT(*) as cnt FROM hiring_signals
       WHERE lower(regexp_replace(company_name, '[^a-z0-9]', '', 'gi')) = lower(regexp_replace($1, '[^a-z0-9]', '', 'gi'))
         AND posted_date >= NOW() - INTERVAL '30 days'`,
      [account.company_name]
    );
    const hCount = Math.min(parseInt(hResult.rows[0].cnt, 10), 3);
    if (hCount > 0) {
      scores.hiring += hCount * WEIGHTS.hiring;
      topSignals.push({ type: 'hiring', count: hCount, source: 'hiring_signals' });
    }

    // crm_signals ingested by sync-crm-signals cron
    const cResult = await conn.query(
      `SELECT COUNT(*) as cnt FROM crm_signals
       WHERE lower(regexp_replace(account_name, '[^a-z0-9]', '', 'gi')) = lower(regexp_replace($1, '[^a-z0-9]', '', 'gi'))
         AND ingested_at >= NOW() - INTERVAL '30 days'`,
      [account.company_name]
    );
    const cCount = Math.min(parseInt(cResult.rows[0].cnt, 10), 3);
    if (cCount > 0) {
      scores.crm_activity += cCount * WEIGHTS.crm_activity;
      topSignals.push({ type: 'crm_activity', count: cCount, source: 'crm_signals' });
    }

    // Email engagement: opens/clicks from email_tracking_events + interested replies
    const emailResult = await conn.query(
      `SELECT
         COUNT(CASE WHEN ete.event_type = 'open' THEN 1 END) as opens,
         COUNT(CASE WHEN ete.event_type = 'click' THEN 1 END) as clicks
       FROM email_tracking_events ete
       JOIN sent_emails se ON se.id = ete.sent_email_id
       JOIN prospects p ON p.id = se.prospect_id
       WHERE lower(regexp_replace(p.company, '[^a-z0-9]', '', 'gi')) = lower(regexp_replace($1, '[^a-z0-9]', '', 'gi'))`,
      [account.company_name]
    );
    const opens = Math.min(parseInt(emailResult.rows[0].opens, 10) || 0, 2);
    const clicks = Math.min(parseInt(emailResult.rows[0].clicks, 10) || 0, 2);

    const replyResult = await conn.query(
      `SELECT COUNT(*) as cnt FROM replies r
       JOIN sent_emails se ON se.id = r.sent_email_id
       JOIN prospects p ON p.id = se.prospect_id
       WHERE r.category = 'interested'
         AND lower(regexp_replace(p.company, '[^a-z0-9]', '', 'gi')) = lower(regexp_replace($1, '[^a-z0-9]', '', 'gi'))`,
      [account.company_name]
    );
    const interestedReplies = parseInt(replyResult.rows[0].cnt, 10) || 0;

    const emailScore = Math.min(opens + clicks + (interestedReplies > 0 ? 3 : 0), WEIGHTS.email * 3);
    if (emailScore > 0) {
      topSignals.push({ type: 'email', opens, clicks, interested_replies: interestedReplies });
    }

    const total = Object.values(scores).reduce((a, b) => a + b, 0) + emailScore;

    if (total === 0) return null;

    await upsertSignalScore({
      account_id: accountId,
      score: total,
      funding_score: scores.funding,
      hiring_score: scores.hiring,
      crm_score: scores.crm_activity,
      news_score: scores.news,
      email_score: emailScore,
      top_signals: topSignals,
    });

    return { account_id: accountId, total };
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  await upsertSignalScore({
    account_id: accountId,
    score: total,
    funding_score: scores.funding,
    hiring_score: scores.hiring,
    crm_score: scores.crm_activity,
    news_score: scores.news,
    email_score: 0,
    top_signals: topSignals,
  });

  return { account_id: accountId, total };
}

module.exports = { scoreAllAccounts, scoreAccount, WEIGHTS };