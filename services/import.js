// Import service — CSV/Excel/Sheets normalization + DB upsert with idempotency.
const crypto = require('crypto');
const pool = require('../db');
const importRuns = require('../db/import-runs');
const XLSX = require('xlsx');
const Papa = require('papaparse');

// Canonical field map. Acceptable headers → canonical key.
const FIELD_MAP = {
  company: 'company_name',
  company_name: 'company_name',
  name: 'company_name',
  account: 'company_name',
  domain: 'domain',
  website: 'domain',
  url: 'domain',
  industry: 'industry',
  vertical: 'industry',
  employees: 'employee_count',
  employee_count: 'employee_count',
  headcount: 'employee_count',
  revenue: 'annual_revenue',
  annual_revenue: 'annual_revenue',
  arr: 'annual_revenue',
  tech_stack: 'tech_stack',
  stack: 'tech_stack',
  technologies: 'tech_stack',
  notes: 'notes',
  comments: 'notes',
  memo: 'notes',
  contact_name: 'contact_name',
  first_name: 'contact_name',
  full_name: 'contact_name',
  contact_email: 'contact_email',
  email: 'contact_email',
  contact_title: 'contact_title',
  title: 'contact_title',
  role: 'contact_title',
  primary: 'primary',
  is_primary: 'primary',
  crm_id: 'crm_account_id',
  crm_account_id: 'crm_account_id',
  rep_email: 'rep_email',
  owner: 'rep_email'
};

const ASYNC_ROW_THRESHOLD = 5000;

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
}

function splitStackCell(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(s => String(s).trim()).filter(Boolean);
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(x => String(x).trim()).filter(Boolean);
    } catch (_) { /* fall through */ }
  }
  return s.split(/[,;|]/).map(x => x.trim()).filter(Boolean);
}

function normalizeRow(raw, mapping) {
  const out = {};
  for (const rawKey of Object.keys(raw)) {
    const canon = FIELD_MAP[normalizeHeader(rawKey)];
    if (!canon) continue;
    if (!mapping[canon] || mapping[canon] === rawKey) {
      let v = raw[rawKey];
      if (canon === 'tech_stack') v = splitStackCell(v);
      out[canon] = v;
    }
  }
  return out;
}

// Parses stringified CSV/TSV into row objects.
function parseCSV(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const headers = rows.shift().map(normalizeHeader);
  return rows
    .filter(r => r.some(v => v && String(v).trim() !== ''))
    .map(r => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = r[idx]; });
      return obj;
    });
}

// Parse uploaded file buffer based on extension.
function parseUploaded(buffer, filename) {
  const ext = String(filename || '').toLowerCase();
  if (ext.endsWith('.csv')) {
    return parseCSV(buffer.toString('utf8'));
  }
  if (ext.endsWith('.tsv')) {
    // Use Papa to be lenient with quoting in TSV files.
    const parsed = Papa.parse(buffer.toString('utf8'), { header: true, skipEmptyLines: true });
    return parsed.data.map(r => {
      const out = {};
      for (const k of Object.keys(r)) out[normalizeHeader(k)] = r[k];
      return out;
    });
  }
  if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return json.map(r => {
      const out = {};
      for (const k of Object.keys(r)) out[normalizeHeader(k)] = r[k];
      return out;
    });
  }
  throw new Error('unsupported-file-type');
}

function autoDetectMapping(rows) {
  const mapping = {};
  if (!rows.length) return mapping;
  const headers = Object.keys(rows[0]);
  for (const h of headers) {
    const canon = FIELD_MAP[h];
    if (canon) mapping[canon] = h;
  }
  return mapping;
}

// Returns { inserted, updated, errors: [{row_index, message}] }.
async function dedupAndInsert({ org_id, rep_id, rows, source = 'csv' }) {
  let inserted = 0, updated = 0;
  const errors = [];
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    try {
      const domain = row.domain ? String(row.domain).toLowerCase().trim() : null;
      if (!domain && !row.company_name) {
        errors.push({ row_index: idx, message: 'missing-domain-and-name' });
        continue;
      }
      const techStack = (row.tech_stack && Array.isArray(row.tech_stack) && row.tech_stack.length) ? row.tech_stack : null;
      const notes = row.notes ? String(row.notes) : null;
      const existing = domain
        ? (await pool.query(
            'SELECT id, rep_id FROM accounts WHERE org_id=$1 AND LOWER(domain)=$2 LIMIT 1',
            [org_id, domain])).rows[0]
        : null;
      if (existing) {
        await pool.query(
          `UPDATE accounts SET company_name=COALESCE($2,company_name), industry=COALESCE($3,industry),
             employee_count=COALESCE($4,employee_count), annual_revenue=COALESCE($5,annual_revenue),
             tech_stack=COALESCE($6,tech_stack), notes=COALESCE($7,notes),
             rep_id=COALESCE($8,rep_id), source=$9, updated_at=NOW() WHERE id=$1`,
          [existing.id, row.company_name || null, row.industry || null,
           row.employee_count ? parseInt(row.employee_count, 10) : null,
           row.annual_revenue ? parseInt(row.annual_revenue, 10) : null,
           techStack, notes,
           row.rep_email || rep_id || null, source]
        );
        updated++;
      } else {
        await pool.query(
          `INSERT INTO accounts (org_id, rep_id, company_name, domain, industry, employee_count, annual_revenue, tech_stack, notes, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [org_id, row.rep_email || rep_id || null, row.company_name || null, domain,
           row.industry || null, row.employee_count ? parseInt(row.employee_count, 10) : null,
           row.annual_revenue ? parseInt(row.annual_revenue, 10) : null,
           techStack, notes, source]
        );
        inserted++;
      }
    } catch (err) {
      console.warn('[import] row error:', err.message);
      errors.push({ row_index: idx, message: err.message || 'unknown' });
    }
  }
  return { inserted, updated, errors };
}

async function previewImport(text, mode = 'csv') {
  let rows;
  if (mode === 'csv' || mode === 'sheets') { rows = parseCSV(text); }
  else { return { headers: [], mapping: {}, preview: [], rows: [] }; }
  return {
    headers: rows.length ? Object.keys(rows[0]) : [],
    mapping: autoDetectMapping(rows),
    preview: rows.slice(0, 25),
    total: rows.length
  };
}

async function commitImport({ org_id, rep_id, text, mode = 'csv', mapping = {}, type = 'account', sourceTag = 'csv' }) {
  let rows;
  if (mode === 'csv' || mode === 'sheets') rows = parseCSV(text);
  else rows = [];
  if (rows.length > ASYNC_ROW_THRESHOLD) {
    const runId = crypto.randomUUID();
    await importRuns.create({
      id: runId, org_id, mode, source: sourceTag, status: 'queued',
      total: rows.length,
      payload: { text, mapping, sourceTag, rep_id }
    });
    return { runId, async: true, total: rows.length };
  }
  const runId = crypto.randomUUID();
  await importRuns.create({ id: runId, org_id, mode, source: sourceTag, total: rows.length });
  const normalized = rows.map(r => normalizeRow(r, mapping));
  const stats = await dedupAndInsert({ org_id, rep_id, rows: normalized, source: mode });
  await importRuns.complete(runId, {
    row_count: rows.length,
    inserted_count: stats.inserted,
    updated_count: stats.updated,
    error_count: stats.errors.length,
    errors: stats.errors
  });
  return {
    runId,
    inserted: stats.inserted,
    updated: stats.updated,
    errors_count: stats.errors.length,
    errors_detail: stats.errors,
    total: rows.length,
    async: false
  };
}

async function commitSheetsImportOAuth(orgId, repId, sheetId, gid) {
  const integrationsDb = require('../db/integrations');
  // The Sheets card in /settings/integrations is an alias of the gmail OAuth
  // scope — the access token is stored under whichever provider the user
  // connected through. Read both so we don't gate on the url they clicked.
  const candidates = ['google_sheets', 'gmail'];
  let accessToken = null;
  for (const provider of candidates) {
    const intg = await integrationsDb.getForOrg(orgId, provider);
    if (intg && intg.status === 'connected' && intg.config && intg.config.access_token) {
      accessToken = intg.config.access_token;
      break;
    }
  }
  if (!accessToken) throw new Error('google-not-connected');
  const range = 'A1:ZZ100000';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?gid=${encodeURIComponent(gid)}`;
  const fetch = require('node:fetch') || ((...args) => import('node-fetch').then(({default:f})=>f(...args)));
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!res.ok) throw new Error('sheet-fetch-failed');
  const body = await res.json();
  const values = body.values || [];
  if (!values.length) return { runId: null, inserted: 0, updated: 0, errors_count: 0, total: 0, async: false };
  const text = values.map(r => r.map(cell => {
    const s = cell == null ? '' : String(cell);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
  return commitImport({ org_id: orgId, rep_id: repId, text, mode: 'sheets', sourceTag: `sheet:${sheetId}` });
}

async function commitSheetsImport({ org_id, rep_id, url }) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('invalid-sheet-url');
  const id = match[1];
  const gidMatch = url.match(/[#&]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  // First try the OAuth path (uses the org's stored Google access token, under either gmail or google_sheets).
  const integrationsDb = require('../db/integrations');
  for (const provider of ['google_sheets', 'gmail']) {
    const intg = await integrationsDb.getForOrg(org_id, provider);
    if (intg && intg.status === 'connected' && intg.config && intg.config.access_token) {
      return commitSheetsImportOAuth(org_id, rep_id, id, gid);
    }
  }
  // Fallback: public CSV export (sheet must be sharing-enabled).
  const fetch = require('node:fetch') || ((...args) => import('node-fetch').then(({default:f})=>f(...args)));
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  let text;
  try {
    const res = await fetch(csvUrl);
    text = await res.text();
  } catch (err) {
    throw new Error('sheet-fetch-failed');
  }
  return commitImport({ org_id, rep_id, text, mode: 'sheets', sourceTag: `sheet:${id}` });
}

module.exports = {
  parseCSV, parseUploaded, autoDetectMapping, normalizeRow, previewImport,
  commitImport, commitSheetsImport, commitSheetsImportOAuth,
  dedupAndInsert, ASYNC_ROW_THRESHOLD
};
