// Warmup rotation — sends small volumes through multiple email accounts
// to build domain reputation before heavy outbound.
const emailAccounts = require('../db/email-accounts');
const { sendEmail } = require('./email-proxy');

const WARMUP_TEMPLATES = [
  { subject: 'Quick question', body: 'Hey, got a sec? Wanted to run something by you.' },
  { subject: 'Following up', body: 'Hey — just checking in. Still around?' },
  { subject: 'Coffee?', body: 'Would love to chat. Are you free this week?' },
  { subject: 'Quick sync', body: 'Hi — looking to connect. Any chance for a quick call?' },
  { subject: 'Idea', body: 'Had a thought — would love your take on it.' },
];

async function runWarmupRound() {
  const accounts = await emailAccounts.getNextWarmupAccount(3);
  if (!accounts.length) {
    console.log('[warmup] No accounts need warmup today');
    return { warmed: 0 };
  }

  let warmed = 0;
  for (const account of accounts) {
    const template = WARMUP_TEMPLATES[warmed % WARMUP_TEMPLATES.length];

    // Warmup: send to self or a safe internal address to exercise the account
    try {
      await sendEmail({
        to: account.email_address,
        subject: template.subject,
        body: template.body,
        fromName: account.display_name,
      });

      await emailAccounts.incrementWarmupCount(account.id);
      warmed++;
    } catch (e) {
      console.error(`[warmup] Failed for ${account.email_address}: ${e.message}`);
    }
  }

  console.log(`[warmup] Warmed ${warmed} accounts`);
  return { warmed };
}

async function getWarmupStatus() {
  const accounts = await emailAccounts.getEmailAccounts();
  return accounts.map(a => ({
    email: a.email_address,
    warmup_enabled: a.warmup_enabled,
    daily_count: a.warmup_daily_count,
    is_primary: a.is_primary,
  }));
}

module.exports = { runWarmupRound, getWarmupStatus };