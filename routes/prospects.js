// Prospect CRUD routes.
const express = require('express');
const router = express.Router();
const prospects = require('../db/prospects');
const { discoverProspects } = require('../services/prospect-research');
const { getProspectEngagementDetails } = require('../db/prospect-engagement');

router.get('/', async (req, res) => {
  const { status, limit = 100 } = req.query;
  try {
    const rows = status
      ? await prospects.getProspectsByStatus(status, parseInt(limit, 10))
      : await prospects.getProspectsByStatus('uncontacted', parseInt(limit, 10));
    res.json({ prospects: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/engagement', async (req, res) => {
  try {
    const details = await getProspectEngagementDetails(parseInt(req.params.id, 10));
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const row = await prospects.getProspectById(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.post('/', async (req, res) => {
  const { name, email, company, title, linkedin_url, icp_data, source } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  try {
    const row = await prospects.upsertProspect({ name, email, company, title, linkedin_url, icp_data, source });
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  const { prospects: data } = req.body;
  if (!Array.isArray(data) || !data.length) return res.status(400).json({ error: 'prospects array required' });
  try {
    const created = await prospects.bulkCreateProspects(data);
    res.status(201).json({ count: created.length, prospects: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });
  const row = await prospects.updateProspectStatus(parseInt(req.params.id, 10), status);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.patch('/:id/icp-data', async (req, res) => {
  const { icp_data } = req.body;
  if (!icp_data) return res.status(400).json({ error: 'icp_data required' });
  const row = await prospects.updateProspectIcpData(parseInt(req.params.id, 10), icp_data);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

// AI prospect discovery — searches web for people matching ICP
router.post('/discover', async (req, res) => {
  const { icp_description, limit = 20 } = req.body;
  if (!icp_description) return res.status(400).json({ error: 'icp_description required' });
  try {
    const discovered = await discoverProspects(icp_description, parseInt(limit, 10));
    // Upsert each discovered prospect into the DB
    if (discovered.length) {
      const saved = await prospects.bulkCreateProspects(discovered);
      return res.json({ discovered: discovered.length, prospects: saved });
    }
    res.json({ discovered: 0, prospects: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;