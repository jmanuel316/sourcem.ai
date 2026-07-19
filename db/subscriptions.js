// Subscriptions query module.
const pool = require('./index');

async function getForOrg(orgId) {
  const result = await pool.query('SELECT * FROM subscriptions WHERE org_id = $1', [orgId]);
  return result.rows[0] || null;
}

async function upsert(sub) {
  const result = await pool.query(
    `INSERT INTO subscriptions
       (org_id, stripe_customer_id, stripe_subscription_id, plan, seat_count, status,
        trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (org_id) DO UPDATE SET
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       plan = EXCLUDED.plan,
       seat_count = EXCLUDED.seat_count,
       status = EXCLUDED.status,
       trial_ends_at = EXCLUDED.trial_ends_at,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       updated_at = NOW()
     RETURNING *`,
    [
      sub.org_id, sub.stripe_customer_id || null, sub.stripe_subscription_id || null,
      sub.plan || 'solidify', sub.seat_count || 1, sub.status || 'trialing',
      sub.trial_ends_at || null, sub.current_period_start || null,
      sub.current_period_end || null, sub.cancel_at_period_end || false
    ]
  );
  return result.rows[0];
}

async function setStatus(orgId, status) {
  await pool.query(
    `UPDATE subscriptions SET status = $2, updated_at = NOW() WHERE org_id = $1`,
    [orgId, status]
  );
}

async function findByCustomer(stripeCustomerId) {
  const result = await pool.query(
    'SELECT * FROM subscriptions WHERE stripe_customer_id = $1 LIMIT 1',
    [stripeCustomerId]
  );
  return result.rows[0] || null;
}

module.exports = { getForOrg, upsert, setStatus, findByCustomer };
