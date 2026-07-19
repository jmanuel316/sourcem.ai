// Payment links — stores Stripe subscription link URL for the landing page.
// Does NOT own Stripe integration — just the DB record.
const pool = require('./index');

async function upsertPaymentLink({ plan_name, stripe_url, amount_cents, billing_interval }) {
  const res = await pool.query(
    `INSERT INTO payment_links (plan_name, stripe_url, amount_cents, billing_interval)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [plan_name, stripe_url, amount_cents, billing_interval]
  );
  return res;
}

async function getActivePaymentLink() {
  const res = await pool.query(
    `SELECT * FROM payment_links WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
  );
  return res.rows[0] || null;
}

module.exports = { upsertPaymentLink, getActivePaymentLink };