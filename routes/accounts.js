// Account and contact management routes.
const express = require('express');
const router = express.Router();
const accounts = require('../db/accounts');

router.get('/', async (req, res) => {
  const repId = parseInt(req.query.rep_id, 10);
  if (!repId) return res.status(400).json({ error: 'rep_id required' });
  try {
    const rows = await accounts.getAccountsByRep(repId, {
      limit: parseInt(req.query.limit, 10) || 50,
    });
    res.json({ accounts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const row = await accounts.getAccountById(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.post('/', async (req, res) => {
  const { rep_id, company_name, domain, industry, employee_count, annual_revenue, crm_account_id, source, contacts } = req.body;
  if (!company_name) return res.status(400).json({ error: 'company_name required' });
  if (!rep_id) return res.status(400).json({ error: 'rep_id required' });
  try {
    const account = await accounts.createAccount({ rep_id, company_name, domain, industry, employee_count, annual_revenue, crm_account_id, source });
    res.status(201).json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  const row = await accounts.updateAccount(parseInt(req.params.id, 10), req.body);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

module.exports = router;