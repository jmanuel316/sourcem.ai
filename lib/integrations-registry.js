// Integrations registry — single source of truth for all providers.
// Each provider has the same shape ({testConnection, connect, refreshIfNeeded, pullData}).
// Real implementations live in services/integrations-providers/<provider>.js.
// V1 ships with a default stub; adding real OAuth keys makes the cards flip live.

const CRM_PROVIDERS = ['salesforce', 'hubspot'];
const HIRING_PROVIDERS = ['greenhouse', 'lever'];
const EMAIL_PROVIDERS = ['gmail', 'm365', 'imap_smtp'];
const OUTBOUND_PROVIDERS = ['webhook', 'zapier'];

const REGISTRY = [
  // CRM
  { provider: 'salesforce', label: 'Salesforce', category: 'crm',
    desc: 'Sync accounts, contacts, and opportunities from Salesforce.',
    capabilities: ['Pull accounts', 'Pull contacts', 'Read CRM activity'],
    defaultScopes: ['api', 'refresh_token'],
    docsPath: '/help/articles/connect-crm',
    oauth: {
      clientIdEnv: 'SALESFORCE_CLIENT_ID',
      clientSecretEnv: 'SALESFORCE_CLIENT_SECRET',
      authorizeUrl: 'https://login.salesforce.com/services/oauth2/authorize',
      tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
      redirectPath: '/api/integrations/callback/salesforce'
    } },
  { provider: 'hubspot', label: 'HubSpot', category: 'crm',
    desc: 'Two-way sync with HubSpot CRM.',
    capabilities: ['Pull accounts', 'Pull contacts', 'Engagement events'],
    defaultScopes: ['oauth', 'crm.objects.companies.read'],
    docsPath: '/help/articles/connect-crm',
    oauth: {
      clientIdEnv: 'HUBSPOT_CLIENT_ID',
      clientSecretEnv: 'HUBSPOT_CLIENT_SECRET',
      authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
      tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
      redirectPath: '/api/integrations/callback/hubspot'
    } },
  // Hiring
  { provider: 'greenhouse', label: 'Greenhouse', category: 'hiring',
    desc: 'Hiring activity from Greenhouse Job Board API.',
    capabilities: ['Open roles', 'Department', 'Hiring velocity'],
    defaultScopes: ['jobs:read'],
    docsPath: '/help/articles/hiring-signals',
    oauth: {
      clientIdEnv: 'GREENHOUSE_CLIENT_ID',
      clientSecretEnv: 'GREENHOUSE_CLIENT_SECRET',
      authorizeUrl: 'https://app.greenhouse.io/oauth/authorize',
      tokenUrl: 'https://api.greenhouse.io/oauth/token',
      redirectPath: '/api/integrations/callback/greenhouse'
    } },
  { provider: 'lever', label: 'Lever', category: 'hiring',
    desc: 'Hiring activity from Lever postings API.',
    capabilities: ['Open postings', 'Hiring velocity'],
    defaultScopes: ['postings:read'],
    docsPath: '/help/articles/hiring-signals',
    oauth: {
      clientIdEnv: 'LEVER_CLIENT_ID',
      clientSecretEnv: 'LEVER_CLIENT_SECRET',
      authorizeUrl: 'https://api.lever.co/v1/oauth/authorize',
      tokenUrl: 'https://api.lever.co/v1/oauth/token',
      redirectPath: '/api/integrations/callback/lever'
    } },
  // Email engagement
  { provider: 'gmail', label: 'Gmail', category: 'email',
    desc: 'Track reply intent, opens, and clicks on Gmail.',
    capabilities: ['Reply intent', 'Click tracking', 'Bounce handling'],
    defaultScopes: ['gmail.readonly'],
    docsPath: '/help/articles/email-engagement',
    oauth: {
      clientIdEnv: 'GMAIL_CLIENT_ID',
      clientSecretEnv: 'GMAIL_CLIENT_SECRET',
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      redirectPath: '/api/integrations/callback/gmail'
    } },
  { provider: 'm365', label: 'Microsoft 365', category: 'email',
    desc: 'Track reply intent on Microsoft 365 mailboxes.',
    capabilities: ['Reply intent', 'Bounce handling'],
    defaultScopes: ['https://outlook.office365.com/IMAP.AccessAsUser.All'],
    docsPath: '/help/articles/email-engagement',
    oauth: {
      clientIdEnv: 'M365_CLIENT_ID',
      clientSecretEnv: 'M365_CLIENT_SECRET',
      authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      redirectPath: '/api/integrations/callback/m365'
    } },
  { provider: 'imap_smtp', label: 'IMAP/SMTP fallback', category: 'email',
    desc: 'Generic IMAP/SMTP connection for any provider.',
    capabilities: ['Reply intent'],
    defaultScopes: [],
    docsPath: '/help/articles/email-engagement' },
  // Outbound
  { provider: 'webhook', label: 'Outbound webhooks', category: 'outbound',
    desc: 'Per-org signed webhook fires on ranked-account change.',
    capabilities: ['ranked_account_changed'],
    defaultScopes: [],
    docsPath: '/help/articles/webhooks' },
  { provider: 'zapier', label: 'Zapier', category: 'outbound',
    desc: 'Use the webhook URL as a Zapier trigger.',
    capabilities: ['ranked_account_changed'],
    defaultScopes: [],
    docsPath: '/help/articles/zapier' },
  // Imports — Google Sheets is an alias for the gmail OAuth scope so we can reuse
  // the existing stored access/refresh tokens for /import pulls.
  { provider: 'google_sheets', label: 'Google Sheets', category: 'imports',
    desc: 'Import accounts from Google Sheets via OAuth.',
    capabilities: ['Read sheet values'],
    defaultScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    docsPath: '/help/articles/import-spreadsheet',
    oauth: {
      clientIdEnv: 'GMAIL_CLIENT_ID',
      clientSecretEnv: 'GMAIL_CLIENT_SECRET',
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      redirectPath: '/api/integrations/callback/google_sheets'
    } }
];

function byProvider(provider) {
  return REGISTRY.find(r => r.provider === provider);
}

function categorized() {
  return {
    crm: REGISTRY.filter(r => r.category === 'crm'),
    hiring: REGISTRY.filter(r => r.category === 'hiring'),
    email: REGISTRY.filter(r => r.category === 'email'),
    outbound: REGISTRY.filter(r => r.category === 'outbound'),
    imports: REGISTRY.filter(r => r.category === 'imports')
  };
}

// LinkedIn is not a direct connector — render it as a static info card.
const INFO_CARDS = [
  { provider: 'linkedin', label: 'LinkedIn (manual path)',
    desc: 'LinkedIn does not offer a Jobs API for partner access. Import weekly-exported hiring CSVs through /import instead.',
    docsPath: '/help/articles/hiring-signals' }
];

module.exports = { REGISTRY, byProvider, categorized, INFO_CARDS, CRM_PROVIDERS, HIRING_PROVIDERS, EMAIL_PROVIDERS, OUTBOUND_PROVIDERS };
