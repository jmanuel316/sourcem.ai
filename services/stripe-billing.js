// Stripe billing service — wraps the official SDK for checkout/portal/webhook.
const Stripe = require('stripe');

function enabled() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function client() {
  if (!enabled()) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function createCheckout({ plan, org_id, source, return_path, trial = false }) {
  if (!enabled()) throw new Error('billing-not-configured');
  const stripe = client();
  const priceId = plan === 'execute'
    ? process.env.SOURCEMAI_EXECUTE_PRICE_ID
    : process.env.SOURCEMAI_SOLIDIFY_PRICE_ID;
  if (!priceId) throw new Error('billing-not-configured');

  const subs = require('../db/subscriptions');
  const orgsDb = require('../db/orgs');
  const org = await orgsDb.getOrg(org_id);
  const existing = await subs.getForOrg(org_id);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: plan === 'execute' ? 1 : 1 }],
    customer_email: org ? org.billing_email : undefined,
    customer: existing && existing.stripe_customer_id ? existing.stripe_customer_id : undefined,
    metadata: { plan: plan === 'execute' ? 'execute' : 'solidify', org_id: String(org_id), source: source || 'unknown' },
    subscription_data: {
      trial_period_days: trial ? 14 : undefined,
      metadata: { plan: plan === 'execute' ? 'execute' : 'solidify', org_id: String(org_id) }
    },
    allow_promotion_codes: true,
    automatic_tax: process.env.STRIPE_TAX_ENABLED === 'true' ? { enabled: true } : undefined,
    success_url: `${process.env.PUBLIC_URL || 'https://sourcem.ai'}${return_path || '/settings/billing?checkout=ok'}`,
    cancel_url: `${process.env.PUBLIC_URL || 'https://sourcem.ai'}/pricing?checkout=canceled`
  });

  return { url: session.url, id: session.id };
}

async function createPortalSession({ org_id, return_path }) {
  if (!enabled()) throw new Error('billing-not-configured');
  const stripe = client();
  const subs = require('../db/subscriptions');
  const existing = await subs.getForOrg(org_id);
  if (!existing || !existing.stripe_customer_id) throw new Error('no-customer');
  const session = await stripe.billingPortal.sessions.create({
    customer: existing.stripe_customer_id,
    return_url: `${process.env.PUBLIC_URL || 'https://sourcem.ai'}${return_path || '/settings/billing'}`
  });
  return { url: session.url };
}

async function updateSeats({ org_id, quantity }) {
  if (!enabled()) throw new Error('billing-not-configured');
  const stripe = client();
  const subs = require('../db/subscriptions');
  const existing = await subs.getForOrg(org_id);
  if (!existing || !existing.stripe_subscription_id) throw new Error('no-subscription');
  if (existing.status === 'past_due') throw new Error('subscription-past-due');
  const sub = await stripe.subscriptions.retrieve(existing.stripe_subscription_id);
  await stripe.subscriptions.update(existing.stripe_subscription_id, {
    items: sub.items.data.map(it => ({ id: it.id, quantity }))
  });
  await subs.upsert({ ...existing, seat_count: quantity });
}

function constructWebhookEvent(rawBody, signature, secret) {
  if (!enabled()) throw new Error('stripe-not-configured');
  const stripe = client();
  return stripe.webhooks.constructEvent(rawBody, signature, secret || process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = { enabled, client, createCheckout, createPortalSession, updateSeats, constructWebhookEvent };
