// Trial lifecycle emails — T-3 and T-1 reminders, T-0 expired notice.
// Runs daily at 08:30 UTC per polsia.toml. Reads subscriptions in trialing state.
const subsDb = require('../db/subscriptions');
const orgsDb = require('../db/orgs');
const tEmail = require('../services/transactional-email');

async function run() {
  const all = await subsDb.getForOrg; // placeholder — write raw query via pool
  const pool = require('../db');
  const subs = (await pool.query(
    `SELECT * FROM subscriptions WHERE status = 'trialing' AND trial_ends_at IS NOT NULL`
  )).rows;
  const now = new Date();
  let sentT3 = 0, sentT1 = 0, sentT0 = 0;
  for (const s of subs) {
    const ends = new Date(s.trial_ends_at);
    const days = Math.ceil((ends - now) / (24 * 60 * 60 * 1000));
    const org = await orgsDb.getOrg(s.org_id);
    if (!org || !org.billing_email) continue;
    if (days === 3) { await tEmail.send(org.billing_email, 'trial_ending_soon', { days_left: 3 }); sentT3++; }
    else if (days === 1) { await tEmail.send(org.billing_email, 'trial_ending_soon', { days_left: 1 }); sentT1++; }
    else if (days <= 0) {
      await tEmail.send(org.billing_email, 'trial_expired', {});
      await subsDb.setStatus(s.org_id, 'expired');
      sentT0++;
    }
  }
  console.log(`[trial-emails] sent T-3=${sentT3} T-1=${sentT1} T-0=${sentT0}`);
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch(err => {
    console.error('[trial-emails] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { run };
