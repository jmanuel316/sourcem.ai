// API route catalog — groups endpoints by domain and reads route definitions
// from routes/*.js to build a developer-facing reference.
//
// Used by /api/docs to render the catalog + per-endpoint test console.

const fs = require('fs');
const path = require('path');

const GROUP_MAP = {
  Accounts:  ['/api/prospects', '/api/campaigns', '/api/email-accounts', '/api/accounts', '/api/reps'],
  Signals:   ['/api/signals', '/api/alerts', '/api/digest'],
  Sequences: ['/api/outbound', '/api/outbound-stats', '/api/sequences', '/api/metrics'],
  Webhooks:  ['/api/webhook', '/api/stripe/webhook', '/api/track', '/api/health'],
  CRM:       ['/api/crm', '/api/integrations'],
  Imports:   ['/api/import'],
  Billing:   ['/api/payment-link', '/api/billing', '/admin/stripe']
};

const MOUNT_TO_SOURCE = {
  '/api/prospects': 'routes/prospects.js',
  '/api/campaigns': 'routes/campaigns.js',
  '/api/email-accounts': 'routes/email-accounts.js',
  '/api/accounts': 'routes/accounts.js',
  '/api/reps': 'routes/reps.js',
  '/api/signals': 'routes/signals.js',
  '/api/alerts': 'routes/alerts.js',
  '/api/digest': 'routes/digest.js',
  '/api/outbound': 'routes/outbound.js',
  '/api/outbound-stats': 'routes/outbound-stats.js',
  '/api/sequences': 'routes/sequences.js',
  '/api/metrics': 'routes/metrics.js',
  '/api/webhook': 'routes/webhook.js',
  '/api/stripe/webhook': 'routes/stripe-webhook.js',
  '/api/track': 'routes/tracking.js',
  '/api/health': 'routes/health.js',
  '/api/crm': 'routes/crm.js',
  '/api/integrations': 'routes/integrations.js',
  '/api/import': 'routes/import.js',
  '/api/payment-link': 'routes/payment-links.js',
  '/api/billing': 'routes/billing.js',
  '/admin/stripe': 'routes/admin-stripe.js'
};

const KNOWN_AUTH = {
  '/api/prospects': { default: 'rep' },
  '/api/campaigns': { default: 'rep' },
  '/api/email-accounts': { default: 'rep' },
  '/api/accounts': { default: 'rep' },
  '/api/reps': { default: 'rep' },
  '/api/signals': { default: 'rep' },
  '/api/alerts': { default: 'rep' },
  '/api/digest': { default: 'rep' },
  '/api/outbound': { default: 'rep' },
  '/api/outbound-stats': { default: 'rep' },
  '/api/sequences': { default: 'rep' },
  '/api/metrics': { default: 'rep' },
  '/api/webhook': { default: 'signature' },
  '/api/stripe/webhook': { default: 'signature' },
  '/api/track': { default: 'public' },
  '/api/health': { default: 'public' },
  '/api/crm': { default: 'rep' },
  '/api/integrations': { default: 'rep' },
  '/api/import': { default: 'rep' },
  '/api/payment-link': { default: 'public' },
  '/api/billing': { default: 'rep' },
  '/admin/stripe': { default: 'admin' }
};

function parseRouteFile(src) {
  // Find every router.<verb>('<path>'[, ...]) call and extract (method, path, regex, bodySnippet).
  const out = [];
  const pattern = /router\.(get|post|put|patch|delete|all|head)\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(src)) !== null) {
    const method = match[1].toUpperCase();
    const p = match[2];
    // Heuristic: capture a few lines after the call to surface the schema.
    const snippet = src.slice(match.index, match.index + 600);
    out.push({ method, path: p, snippet });
  }
  return out;
}

function pickAuthForRoute(method, pathSnip) {
  // Stretch: if the call mentions requireAdmin the route is admin-only.
  if (/requireAdmin/.test(pathSnip) || /\badmin\b/.test(pathSnip)) return 'admin';
  if (/requireRep/.test(pathSnip)) return 'rep';
  return null;
}

function buildExample(method, mount, path) {
  const fullPath = normalizeFullPath(mount, path);
  const lines = [];
  lines.push(`curl -X ${method} "https://sourcem.ai${fullPath}" \\`);
  const auth = KNOWN_AUTH[mount] && KNOWN_AUTH[mount].default;
  if (auth === 'rep' || auth === 'admin') {
    lines.push(`  -H "Authorization: Bearer $SMAI_TOKEN" \\`);
  }
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    lines.push(`  -H "Content-Type: application/json" \\`);
    if (mount === '/api/import') {
      lines.push(`  -d '{ "text": "company_name,domain\\nAcme,acme.com", "mode": "csv" }'`);
    } else if (mount.startsWith('/api/accounts')) {
      lines.push(`  -d '{ "company_name": "Acme", "domain": "acme.com" }'`);
    } else {
      lines.push(`  -d '{}'`);
    }
  }
  return lines.join('\n');
}

function buildExampleResponse(mount, method, p) {
  if (mount === '/api/accounts' && method === 'GET' && p === '/') {
    return JSON.stringify({ accounts: [{ id: 1, company_name: 'Acme', domain: 'acme.com', industry: 'SaaS' }] }, null, 2);
  }
  if (mount === '/api/accounts' && method === 'POST') {
    return JSON.stringify({ id: 1, company_name: 'Acme', domain: 'acme.com' }, null, 2);
  }
  if (mount === '/api/digest' && method === 'GET') {
    return JSON.stringify({ date: '2026-07-18', entries: [{ account_id: 1, priority: 'high', why: 'Series B funding' }] }, null, 2);
  }
  if (mount === '/api/signals') {
    return JSON.stringify({ signals: [{ id: 1, type: 'funding', account_id: 1, score: 8 }] }, null, 2);
  }
  return '{ "ok": true }';
}

function buildRequestSchema(mount, method, p) {
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') return null;
  if (mount === '/api/import') {
    return { text: 'string (CSV body)', mode: 'csv|sheets', mapping: { company_name: 'header' } };
  }
  if (mount.startsWith('/api/accounts')) {
    return { company_name: 'string', domain: 'string', industry: 'string', employee_count: 'integer', annual_revenue: 'integer' };
  }
  return {};
}

function normalizeFullPath(mount, p) {
  if (!p) return mount;
  // Dedupe trailing duplicated segment (e.g. /api/stripe/webhook + /webhook → /api/stripe/webhook).
  const segs = mount.split('/').filter(Boolean);
  const lastSeg = segs[segs.length - 1];
  if (lastSeg && p.startsWith('/' + lastSeg)) {
    const dup = '/' + lastSeg;
    if (p === dup || p.startsWith(dup + '/')) return mount + p.slice(dup.length);
  }
  return mount + p;
}

function buildCatalog({ isAdmin = false } = {}) {
  const root = path.join(__dirname, '..');
  const groups = [];
  for (const [groupName, mounts] of Object.entries(GROUP_MAP)) {
    const endpoints = [];
    for (const mount of mounts) {
      const sourcePath = MOUNT_TO_SOURCE[mount];
      if (!sourcePath) continue;
      const full = path.join(root, sourcePath);
      if (!fs.existsSync(full)) continue;
      const src = fs.readFileSync(full, 'utf8');
      const routes = parseRouteFile(src);
      for (const { method, path: p, snippet } of routes) {
        const auth = pickAuthForRoute(method, snippet) || (KNOWN_AUTH[mount] && KNOWN_AUTH[mount].default) || 'rep';
        endpoints.push({
          method, fullPath: normalizeFullPath(mount, p),
          mount, path: p,
          auth,
          request_schema: buildRequestSchema(mount, method, p),
          example_curl: buildExample(method, mount, p),
          example_response: buildExampleResponse(mount, method, p)
        });
      }
    }
    if (endpoints.length) groups.push({ name: groupName, endpoints });
  }
  return { groups, isAdmin };
}

module.exports = { buildCatalog, GROUP_MAP };
