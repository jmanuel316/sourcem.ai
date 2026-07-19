// Help / knowledge base.
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const ARTICLES_DIR = path.join(__dirname, '..', 'views', 'help', 'articles');
const DEFAULT_ARTICLES = [
  { slug: 'what-is-a-signal-score', title: 'What is a signal score?',
    summary: 'How funding, hiring, and CRM activity combine into a per-account score.',
    body: 'A signal score is the weighted sum of recent activity at an account. Funding events weigh 3 points, hiring 2 points, CRM activity 2 points. The score resets each daily batch so stale signals do not accumulate.' },
  { slug: 'connect-crm', title: 'Connect your CRM',
    summary: 'Salesforce and HubSpot connector setup in under two minutes.',
    body: 'Open Settings → Integrations, choose Salesforce or HubSpot, click Connect, paste the API key (or complete OAuth). Click Test connection — green means green. Reauth-needed status means the refresh token expired; click Reconnect.' },
  { slug: 'import-spreadsheet', title: 'Import accounts from a spreadsheet',
    summary: 'CSV, XLSX, or Google Sheets — column auto-detection and dedupe.',
    body: 'Open Import. Switch tabs between CSV/Sheets. Headers auto-detect against canonical fields (company_name, domain, industry, employee_count, annual_revenue, contact_name, contact_email). Re-imports dedupe by domain or CRM account ID.' },
  { slug: 'set-up-solidify', title: 'Set up Solidify',
    summary: 'Annual $1,599 plan with 14-day trial. Card optional during trial.',
    body: 'Click Get Solidify on /pricing. Stripe Checkout opens in test mode if STRIPE_SECRET_KEY is configured. The 14-day Solidify trial starts at signup; trial emails fire at T-3 and T-1.' },
  { slug: 'execute-seats', title: 'Add Execute seats',
    summary: 'Annual $109/seat add-on; Stripe quantity syncs automatically.',
    body: 'From Settings → Users, click Add Execute seat. Stripe quantity increases by 1. Removing the last Execute seat reverts the plan to Solidify-only.' },
  { slug: 'cancel-or-pause', title: 'Cancel or pause',
    summary: 'Self-serve cancellation via the Stripe Customer Portal.',
    body: 'Settings → Billing → Manage in Stripe Portal. Cancellation keeps data access through the end of the current period. After the period ends, the digest stops and the team falls back to read-only.' }
];

router.get('/help', (_req, res) => {
  const articles = DEFAULT_ARTICLES;
  res.render('help', { title: 'Help', layout: false, articles });
});

router.get('/help/articles/:slug', (req, res) => {
  const article = DEFAULT_ARTICLES.find(a => a.slug === req.params.slug);
  if (!article) return res.status(404).render('err/404', { title: 'Not found', layout: false });
  res.render('help-article', { title: article.title, layout: false, article });
});

module.exports = router;
