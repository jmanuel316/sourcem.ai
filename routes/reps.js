// Rep management routes.
const express = require('express');
const router = express.Router();
const reps = require('../db/reps');
const sessions = require('../db/sessions');
const { sendMagicLink } = require('../services/email-proxy');

// GET /api/reps/me — returns authenticated rep or 401
router.get('/me', (req, res) => {
  if (!req.rep) return res.status(401).json({ error: 'not authenticated' });
  res.json({ id: req.rep.id, name: req.rep.name, email: req.rep.email, role: req.rep.role });
});

router.get('/', async (_req, res) => {
  try {
    const rows = await reps.getAllReps();
    res.json({ reps: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const row = await reps.getRepById(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.post('/', async (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  try {
    const row = await reps.upsertRep({ name, email, role: role || 'rep' });
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reps/invite — admin invites a new rep via magic link
router.post('/invite', async (req, res) => {
  if (!req.rep || req.rep.role !== 'admin') {
    return res.status(403).json({ error: 'admin only' });
  }
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    const existing = await reps.getRepByEmail(email);
    if (existing) return res.status(400).json({ error: 'email already registered' });

    const rep = await reps.createRep({ name: email.split('@')[0], email, role: 'rep', company_id: req.rep.company_id });
    const token = await sessions.createSession(rep.id);
    const sent = await sendMagicLink(email, token);
    if (!sent) return res.status(500).json({ error: 'Failed to send invite email' });

    res.json({ rep: { id: rep.id, email: rep.email, role: rep.role }, sent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  const row = await reps.updateRep(parseInt(req.params.id, 10), req.body);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

module.exports = router;