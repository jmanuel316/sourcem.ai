// Org / Team / Account-context settings sub-pages.
const express = require('express');
const router = express.Router();
const { requireRep } = require('../middleware/auth');
const orgs = require('../db/orgs');
const reps = require('../db/reps');
const accounts = require('../db/accounts');
const audit = require('../services/audit');

function requireSettingAdmin(req, res, next) {
  if (!req.rep || req.rep.role !== 'admin') {
    return res.status(403).render('err/404', { title: 'Forbidden', layout: false });
  }
  next();
}

router.get('/org', requireRep, requireSettingAdmin, async (req, res) => {
  const org = req.rep.company_id ? await orgs.getOrg(req.rep.company_id) : null;
  res.render('settings-org', {
    title: 'Organization', layout: false, nav: { current: 'settings' },
    org, query: req.query
  });
});

router.post('/org', requireRep, requireSettingAdmin, async (req, res) => {
  const { name, billing_email } = req.body || {};
  await orgs.updateOrg(req.rep.company_id, {
    name: typeof name === 'string' ? name.trim() : undefined,
    billing_email: typeof billing_email === 'string' ? billing_email.trim() : undefined
  });
  await audit.record({ req, rep: req.rep }, 'org.updated', {
    target_type: 'org',
    target_id: String(req.rep.company_id),
    metadata: { fields: ['name', 'billing_email'].filter(f => req.body && req.body[f] !== undefined) }
  });
  res.redirect('/settings/org?saved=1');
});

router.get('/team', requireRep, requireSettingAdmin, async (req, res) => {
  const all = await reps.getAllReps();
  const teamRows = await reps.getActiveRepsWithStats();
  const companyId = req.rep.company_id;
  const merged = (all.length ? all : teamRows).map(r => {
    const stats = teamRows.find(s => s.id === r.id) || {};
    return { ...r, ...stats };
  }).filter(r => !companyId || r.company_id === companyId);
  res.render('settings-team', {
    title: 'Team', layout: false, nav: { current: 'settings' },
    team: merged, query: req.query
  });
});

router.post('/team/invite', requireRep, requireSettingAdmin, async (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.redirect('/settings/team?invited=0');
  await reps.createRep({
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    role: 'rep',
    company_id: req.rep.company_id
  });
  await audit.record({ req, rep: req.rep }, 'team.invite', {
    target_type: 'rep',
    metadata: { email: String(email).trim().toLowerCase() }
  });
  res.redirect('/settings/team?invited=1');
});

router.post('/team/:id/deactivate', requireRep, requireSettingAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.redirect('/settings/team');
  await reps.updateRep(id, { is_active: false });
  await audit.record({ req, rep: req.rep }, 'team.deactivate', {
    target_type: 'rep',
    target_id: String(id)
  });
  res.redirect('/settings/team');
});

router.get('/account-context', requireRep, async (req, res) => {
  const list = await accounts.getAccountsByRep(req.rep.id);
  res.render('settings-account-context', {
    title: 'Account context', layout: false, nav: { current: 'settings' },
    accounts: list
  });
});

async function loadOwnedAccount(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  const owned = await accounts.getAccountsByRep(req.rep.id, { limit: 500 });
  if (!owned.some(a => a.id === id)) return null;
  return accounts.getAccountById(id);
}

router.get('/account/:id', requireRep, async (req, res) => {
  const account = await loadOwnedAccount(req, res);
  if (!account) return res.status(403).render('err/404', { title: 'Forbidden', layout: false });
  res.render('settings-account', {
    title: 'Account context', layout: false, nav: { current: 'settings' },
    account, query: req.query
  });
});

router.post('/account/:id', requireRep, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(403).render('err/404', { title: 'Forbidden', layout: false });
  const owned = await accounts.getAccountsByRep(req.rep.id, { limit: 500 });
  if (!owned.some(a => a.id === id)) return res.status(403).render('err/404', { title: 'Forbidden', layout: false });

  const body = req.body || {};
  const fields = {};
  if (typeof body.company_name === 'string') fields.company_name = body.company_name.trim();
  if (typeof body.domain === 'string') fields.domain = body.domain.trim();
  if (typeof body.industry === 'string') fields.industry = body.industry.trim();
  if (body.employee_count !== undefined && body.employee_count !== '') {
    const n = parseInt(body.employee_count, 10);
    if (Number.isInteger(n)) fields.employee_count = n;
  }
  if (body.annual_revenue !== undefined && body.annual_revenue !== '') {
    const n = Number(body.annual_revenue);
    if (Number.isFinite(n)) fields.annual_revenue = n;
  }
  if (typeof body.crm_account_id === 'string') fields.crm_account_id = body.crm_account_id.trim();

  await accounts.updateAccount(id, fields);
  await audit.record({ req, rep: req.rep }, 'account.updated', {
    target_type: 'account',
    target_id: String(id),
    metadata: { fields: Object.keys(fields) }
  });
  res.redirect(`/settings/account/${id}?saved=1`);
});

module.exports = router;
