// Stripe webhook handler — updates subscription state in real-time.
// Mounted BEFORE express.json() so it gets the raw body.
const express = require('express');
const router = express.Router();
const subsDb = require('../db/subscriptions');
const orgsDb = require('../db/orgs');
const stripeSvc = require('../services/stripe-billing');
const tEmail = require('../services/transactional-email');
const audit = require('../services/audit');
const notificationsDb = require('../db/notifications');

router.post('/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    let event;
    try {
      event = stripeSvc.constructWebhookEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.warn('[stripe webhook] signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const orgId = parseInt(session.metadata && session.metadata.org_id, 10);
          if (!orgId) break;
          const stripeSubId = typeof session.subscription === 'string' ? session.subscription : (session.subscription && session.subscription.id);
          const stripeCustomerId = typeof session.customer === 'string' ? session.customer : (session.customer && session.customer.id);
          const stripe = stripeSvc.client();
          let sub = null;
          if (stripeSubId) { try { sub = await stripe.subscriptions.retrieve(stripeSubId); } catch (_) {} }
          const plan = (sub && sub.items && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id === process.env.SOURCEMAI_EXECUTE_PRICE_ID) ? 'solidify+execute' : 'solidify';
          await subsDb.upsert({
            org_id: orgId,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubId,
            plan,
            status: sub ? sub.status : 'active',
            seat_count: sub && sub.items ? sub.items.data.reduce((s,i)=>s + i.quantity, 0) : 1,
            current_period_start: sub ? new Date(sub.current_period_start * 1000) : null,
            current_period_end: sub ? new Date(sub.current_period_end * 1000) : null,
            cancel_at_period_end: sub ? !!sub.cancel_at_period_end : false,
            trial_ends_at: sub && sub.trial_end ? new Date(sub.trial_end * 1000) : null
          });
          await audit.record({ req: { headers: {} }, rep: null }, 'billing.checkout.completed', { target_type: 'subscription', target_id: stripeSubId, metadata: { orgId, plan } });
          if (plan === 'solidify+execute') {
            await tEmail.send((await orgsDb.getOrg(orgId))?.billing_email, 'plan_changed', { plan });
          }
          break;
        }
        case 'customer.subscription.updated': {
          const sub = event.data.object;
          const orgId = parseInt(sub.metadata && sub.metadata.org_id, 10);
          if (!orgId) break;
          await subsDb.upsert({
            org_id: orgId,
            stripe_customer_id: sub.customer, stripe_subscription_id: sub.id,
            plan: 'solidify', // updated separately on session.completed
            seat_count: sub.items.data.reduce((s,i)=>s+i.quantity, 0),
            status: sub.status,
            current_period_start: new Date(sub.current_period_start * 1000),
            current_period_end: new Date(sub.current_period_end * 1000),
            cancel_at_period_end: !!sub.cancel_at_period_end
          });
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const orgId = parseInt(sub.metadata && sub.metadata.org_id, 10);
          if (!orgId) break;
          await subsDb.upsert({
            org_id: orgId, stripe_subscription_id: sub.id, plan: 'solidify',
            status: 'canceled', cancel_at_period_end: true,
            current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
          });
          const org = await orgsDb.getOrg(orgId);
          if (org && org.billing_email) {
            await tEmail.send(org.billing_email, 'subscription_canceled',
              { period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null });
          }
          break;
        }
        case 'invoice.payment_failed': {
          const inv = event.data.object;
          const sub = await subsDb.findByCustomer(inv.customer).catch(()=>null);
          if (sub) {
            await subsDb.setStatus(sub.org_id, 'past_due');
            await notificationsDb.create({ org_id: sub.org_id, rep_id: null, type: 'billing', title: 'Payment failed', body: 'Update your payment method to continue.', link: '/settings/billing' });
            const org = await orgsDb.getOrg(sub.org_id);
            if (org && org.billing_email) {
              await tEmail.send(org.billing_email, 'payment_failed_dunning', {});
            }
          }
          break;
        }
        case 'invoice.payment_succeeded': {
          const inv = event.data.object;
          await tEmail.send(inv.customer_email, 'payment_received_invoice', { amount: inv.amount_paid, invoice_url: inv.invoice_pdf || inv.hosted_invoice_url });
          break;
        }
        default:
          break;
      }
      res.json({ received: true });
    } catch (err) {
      console.error('[stripe webhook] handler error:', err.message);
      res.status(500).json({ error: 'handler-failed', message: err.message });
    }
  }
);

module.exports = router;
