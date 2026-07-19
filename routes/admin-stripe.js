// Temporary admin route for one-time Stripe payment link update.
const express = require('express');
const router = express.Router();

const PAYMENT_LINK_ID = 'prod_5kQ14o3ixdLb6RG3mg7ss00';
const SUCCESS_URL = 'https://sourcem.ai/success';
const CANCEL_URL = 'https://sourcem.ai/cancel';

router.post('/update-payment-link', async (req, res) => {
  const { STRIPE_SECRET_KEY } = process.env;
  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
  }

  try {
    const Stripe = require('stripe');
    const stripe = new Stripe(STRIPE_SECRET_KEY);

    const updated = await stripe.paymentLinks.update(PAYMENT_LINK_ID, {
      after_completion: { type: 'redirect', redirect: { url: SUCCESS_URL } },
      cancel_url: CANCEL_URL,
      success_url: SUCCESS_URL,
    });

    res.json({
      success: true,
      id: updated.id,
      url: updated.url,
      success_url: updated.success_url,
      cancel_url: updated.cancel_url,
      after_completion: updated.after_completion,
    });
  } catch (err) {
    console.error('[admin-stripe] Update failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET version for verification after update
router.get('/update-payment-link', async (req, res) => {
  const { STRIPE_SECRET_KEY } = process.env;
  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
  }

  try {
    const Stripe = require('stripe');
    const stripe = new Stripe(STRIPE_SECRET_KEY);

    const link = await stripe.paymentLinks.retrieve(PAYMENT_LINK_ID);
    res.json({
      id: link.id,
      url: link.url,
      success_url: link.success_url,
      cancel_url: link.cancel_url,
      after_completion: link.after_completion,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;