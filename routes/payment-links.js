// Payment link endpoint — returns Stripe subscription URL for landing page.
// GET /api/payment-link
const express = require('express');
const router = express.Router();
const { getActivePaymentLink } = require('../db/payment-links');

router.get('/', async (_req, res) => {
  const link = await getActivePaymentLink();
  if (!link) return res.status(404).json({ error: 'No active payment link' });
  res.json({ url: link.stripe_url, plan: link.plan_name, amount: link.amount_cents / 100 });
});

module.exports = router;