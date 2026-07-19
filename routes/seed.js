// Seed demo data — creates one email account, one campaign, and sample prospects.
// POST /api/seed — safe to run multiple times (uses upsert semantics).
// POST /api/seed/digest — seeds reps, accounts, and signals for the PWA digest demo.
const express = require('express');
const router = express.Router();
const emailAccounts = require('../db/email-accounts');
const campaigns = require('../db/campaigns');
const prospects = require('../db/prospects');
const { upsertPaymentLink } = require('../db/payment-links');
const pool = require('../db/index');
const { scoreAllAccounts } = require('../services/signal-scorer');
const { generateAllDigests } = require('../services/digest-generator');

const DEMO_PROSPECTS = [
  { name: 'Sarah Chen', email: 'sarah.chen@techflow.io', company: 'TechFlow', title: 'VP of Engineering', icp_data: { company_size: '100-300', industry: 'DevOps / SaaS', funding_stage: 'Series B', key_product: 'CI/CD automation platform' } },
  { name: 'Marcus Johnson', email: 'mjohnson@scalehq.com', company: 'ScaleHQ', title: 'Head of Growth', icp_data: { company_size: '50-200', industry: 'B2B SaaS', funding_stage: 'Series A', key_product: 'Sales intelligence tool' } },
  { name: 'Priya Patel', email: 'priya@pulseanalytics.com', company: 'Pulse Analytics', title: 'CTO', icp_data: { company_size: '20-100', industry: 'Analytics / BI', funding_stage: 'Seed', key_product: 'Real-time business intelligence' } },
  { name: 'James Okafor', email: 'jokafor@cloudnative.co', company: 'CloudNative Co', title: 'Director of Product', icp_data: { company_size: '50-250', industry: 'Cloud infrastructure', funding_stage: 'Series A', key_product: 'Kubernetes management platform' } },
  { name: 'Elena Rodriguez', email: 'elena.r@nexgenai.com', company: 'NexGen AI', title: 'VP Sales', icp_data: { company_size: '30-150', industry: 'AI/ML', funding_stage: 'Series B', key_product: 'Enterprise AI agents' } },
  { name: 'David Kim', email: 'dkim@buildfast.dev', company: 'BuildFast', title: 'Co-founder & CEO', icp_data: { company_size: '10-50', industry: 'Developer tools', funding_stage: 'Seed', key_product: 'Instant deployment platform' } },
  { name: 'Amira Hassan', email: 'amira@dataops.com', company: 'DataOps Inc', title: 'Head of Customer Success', icp_data: { company_size: '40-200', industry: 'Data infrastructure', funding_stage: 'Series A', key_product: 'Data pipeline orchestration' } },
  { name: 'Tom Wheeler', email: 'twheeler@saasmetrics.io', company: 'SaaS Metrics', title: 'Director of Sales', icp_data: { company_size: '20-100', industry: 'B2B SaaS analytics', funding_stage: 'Seed', key_product: 'Subscription analytics platform' } },
];

router.post('/', async (req, res) => {
  try {
    // 1. Create or confirm email account
    const emailAccount = await emailAccounts.createEmailAccount({
      email_address: 'outboundos53@polsia.app',
      display_name: 'SourcemAI',
      is_primary: true,
    }).catch(async () => {
      // Already exists — set as primary
      const existing = await emailAccounts.getEmailAccountById(1).catch(() => null);
      if (existing) return emailAccounts.setPrimaryEmailAccount(existing.id);
      return null;
    });

    // 2. Create campaign
    let campaign = null;
    try {
      campaign = await campaigns.createCampaign({
        name: 'B2B SaaS Decision Makers',
        icp_description: 'B2B SaaS companies, 50-500 employees, Series A-B, VP-level or C-suite in Engineering, Product, Sales, or Growth. Using developer tools, CI/CD, or sales intelligence software.',
        daily_limit: 30,
      });
    } catch {
      // Campaign already exists — use first active one
      const existing = await campaigns.getActiveCampaigns();
      campaign = existing[0] || null;
    }

    // 3. Upsert sample prospects
    const saved = await prospects.bulkCreateProspects(DEMO_PROSPECTS);

    // 4. Persist Stripe payment link (idempotent)
    await upsertPaymentLink({
      plan_name: 'SourcemAI Pro',
      stripe_url: 'https://buy.stripe.com/5kQ14o3ixdLb6RG3mg7ss00',
      amount_cents: 9900,
      billing_interval: 'month',
    }).catch(() => {/* already seeded */});

    res.json({
      email_account: emailAccount ? `primary: ${emailAccount.email_address}` : 'already configured',
      campaign: campaign ? `created: ${campaign.name}` : 'already exists',
      prospects: saved.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/seed/digest — seed demo reps, accounts, and signals for PWA demo
router.post('/digest', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert two demo reps
    const repRows = await client.query(
      `INSERT INTO reps (id, name, email, role, is_active)
       VALUES (1, 'Alex Morgan', 'alex@sourcemai.com', 'rep', TRUE),
              (2, 'Jordan Lee', 'jordan@sourcemai.com', 'rep', TRUE)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = TRUE
       RETURNING id, name`,
    );

    // Demo accounts
    const accounts = [
      { name: 'NexGen AI', domain: 'nexgenai.com', industry: 'AI/ML', rep_id: 1, funding: true, hiring: true },
      { name: 'Pulse Analytics', domain: 'pulseanalytics.com', industry: 'Analytics', rep_id: 1, funding: false, hiring: false },
      { name: 'TechFlow', domain: 'techflow.io', industry: 'DevOps/SaaS', rep_id: 1, funding: true, hiring: false },
      { name: 'ScaleHQ', domain: 'scalehq.com', industry: 'B2B SaaS', rep_id: 2, funding: false, hiring: true },
      { name: 'CloudNative Co', domain: 'cloudnative.co', industry: 'Cloud infrastructure', rep_id: 2, funding: true, hiring: true },
      { name: 'BuildFast', domain: 'buildfast.dev', industry: 'Developer tools', rep_id: 2, funding: false, hiring: false },
    ];

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(today.getDate() - 2);

    const accountIds = [];
    for (const acc of accounts) {
      const aRow = await client.query(
        `INSERT INTO accounts (rep_id, company_name, domain, industry, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [acc.rep_id, acc.name, acc.domain, acc.industry],
      );
      const existing = await client.query('SELECT id FROM accounts WHERE company_name = $1', [acc.name]);
      const accId = existing.rows[0].id;
      accountIds.push({ id: accId, name: acc.name, rep_id: acc.rep_id });

      // Contact
      await client.query(
        `INSERT INTO contacts (account_id, name, title, email, is_primary)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT DO NOTHING`,
        [accId, `${acc.name.split(' ')[0]} Contact`, 'VP Sales', `contact@${acc.domain}`],
      );

      // Signals
      if (acc.funding) {
        await client.query(
          `INSERT INTO signals (account_id, signal_type, source, title, description, signal_date)
           VALUES ($1, 'funding', 'manual', $2, 'Closed Series B — new budget available', $3)`,
          [accId, `Series B round closed`, yesterday.toISOString().split('T')[0]],
        );
        await client.query(
          `INSERT INTO signals (account_id, signal_type, source, title, description, signal_date)
           VALUES ($1, 'funding', 'manual', 'Seed round announced', 'Raised $8M seed', $3)`,
          [accId, twoDaysAgo.toISOString().split('T')[0]],
        );
      }
      if (acc.hiring) {
        await client.query(
          `INSERT INTO signals (account_id, signal_type, source, title, description, signal_date)
           VALUES ($1, 'hiring', 'manual', 'GTM hiring surge detected', '5 new sales/GTM roles posted this week', $2)`,
          [accId, yesterday.toISOString().split('T')[0]],
        );
        await client.query(
          `INSERT INTO signals (account_id, signal_type, source, title, description, signal_date)
           VALUES ($1, 'hiring', 'manual', 'VP of Sales hired', 'New VP Sales joined from Salesforce', $2)`,
          [accId, today.toISOString().split('T')[0]],
        );
      }
      if (!acc.funding && !acc.hiring) {
        await client.query(
          `INSERT INTO signals (account_id, signal_type, source, title, description, signal_date)
           VALUES ($1, 'crm_activity', 'manual', 'Deal stage updated', 'Opportunity moved to negotiation', $2)`,
          [accId, yesterday.toISOString().split('T')[0]],
        );
        await client.query(
          `INSERT INTO signals (account_id, signal_type, source, title, description, signal_date)
           VALUES ($1, 'crm_activity', 'manual', 'Meeting scheduled', 'Demo call booked for next week', $2)`,
          [accId, today.toISOString().split('T')[0]],
        );
      }
    }

    await client.query('COMMIT');

    // Score accounts and generate digests so the PWA shows data immediately
    await scoreAllAccounts();
    const digests = await generateAllDigests();

    res.json({
      reps: repRows.rows.length,
      accounts: accountIds.length,
      digests_generated: digests.length,
      message: 'Digest demo data seeded — visit /digest to see the PWA',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;