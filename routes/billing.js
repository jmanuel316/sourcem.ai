// Billing routes — Stripe Checkout, Portal, seats, webhook.
const express = require('express');
const router = express.Router();
const { requireRep, requireAdmin } = require('../middleware/auth');
const subsDb = require('../db/subscriptions');
const audit = require('../services/audit');
const stripeSvc = require('../services/stripe-billing');
const rateLimit = require('../middleware/rate-limit');

// POST /api/billing/checkout  {plan: 'solidify'|'execute', source: string}
router.post('/checkout', requireRep, async (req, res) => {
  try {
    const { plan = 'solidify', source = 'in-app', return_path = '/settings/billing' } = req.body || {};
    if (!['solidify', 'execute'].includes(plan)) return res.status(400).json({ error: 'invalid-plan' });
    const result = await stripeSvc.createCheckout({
      plan, org_id: req.rep.company_id, source,
      return_path, trial: source === 'signup'
    });
    await audit.record({ req, rep: req.rep }, 'billing.checkout.start', { metadata: { plan, source } });
    res.json(result);
  } catch (err) {
    if (err.message === 'billing-not-configured') {
      return res.status(503).json({ error: 'billing-not-configured',
        message: 'Billing is not configured. Set STRIPE_SECRET_KEY, SOURCEMAI_SOLIDIFY_PRICE_ID, SOURCEMAI_EXECUTE_PRICE_ID.' });
    }
    res.status(500).json({ error: 'checkout-failed', message: err.message });
  }
});

const seatLimiter = rateLimit.byRep(30, 60 * 1000);
router.post('/update-seats', requireAdmin, seatLimiter, async (req, res) => {
  try {
    const { quantity } = req.body || {};
    const q = parseInt(quantity, 10);
    if (!Number.isInteger(q) || q < 1 || q > 100) return res.status(400).json({ error: 'invalid-quantity' });
    await stripeSvc.updateSeats({ org_id: req.rep.company_id, quantity: q });
    await audit.record({ req, rep: req.rep }, 'billing.seats.updated', { metadata: { quantity: q } });
    res.json({ ok: true, quantity: q });
  } catch (err) {
    const msg = err.message === 'subscription-past-due'
      ? 'subscription-past-due'
      : (err.message === 'no-subscription' ? 'no-subscription' : err.message);
    res.status(400).json({ error: msg });
  }
});

router.post('/portal', requireAdmin, async (req, res) => {
  try {
    const result = await stripeSvc.createPortalSession({
      org_id: req.rep.company_id,
      return_path: (req.body && req.body.return_path) || '/settings/billing'
    });
    res.json(result);
  } catch (err) {
    if (err.message === 'billing-not-configured' || err.message === 'no-customer') {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: 'portal-failed', message: err.message });
  }
});

// GET /settings/billing — full billing view.
router.get('/settings/billing', requireRep, async (req, res) => {
  const orgId = req.rep.company_id;
  const sub = orgId ? await subsDb.getForOrg(orgId) : null;
  let invoices = [];
  if (sub && sub.stripe_customer_id && stripeSvc.enabled()) {
    try {
      const stripe = stripeSvc.client();
      const list = await stripe.invoices.list({ customer: sub.stripe_customer_id, limit: 24 });
      invoices = list.data;
    } catch (err) {
      console.warn('[billing] invoices fetch failed:', err.message);
    }
  }
  res.render('billing', { title: 'Billing', layout: false, nav: { current: 'settings' }, sub, invoices });
});

module.exports = router;
