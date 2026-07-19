// Dunning job — query Stripe for past_due subscriptions, send payment-failed email
// and create an in-app banner via notifications table.
const Stripe = require('stripe');
const subsDb = require('../db/subscriptions');
const orgsDb = require('../db/orgs');
const notificationsDb = require('../db/notifications');
const tEmail = require('../services/transactional-email');

async function run() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('[dunning] STRIPE_SECRET_KEY not set — skipping.');
    return;
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const subs = await stripe.subscriptions.list({ status: 'past_due', limit: 100 });
  for (const sub of subs.data) {
    const org = await subsDb.findByCustomer(sub.customer);
    if (!org) continue;
    await subsDb.setStatus(org.org_id, 'past_due');
    await notificationsDb.create({
      org_id: org.org_id, rep_id: null, type: 'billing',
      title: 'Payment failed', body: 'Update your payment method to continue.',
      link: '/settings/billing'
    });
    const orgRow = await orgsDb.getOrg(org.org_id);
    if (orgRow && orgRow.billing_email) {
      await tEmail.send(orgRow.billing_email, 'payment_failed_dunning', {});
    }
  }
  console.log(`[dunning] processed ${subs.data.length} past_due subscriptions.`);
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch(err => {
    console.error('[dunning] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { run };
