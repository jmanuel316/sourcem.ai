// Audit log routes.
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const auditDb = require('../db/audit');

router.get('/admin/audit', requireAdmin, async (req, res) => {
  const items = req.rep.company_id ? await auditDb.recent(req.rep.company_id, { limit: 200 }) : [];
  res.render('admin-audit', { title: 'Audit Log', layout: false, nav: { current: 'admin-audit' }, items });
});

module.exports = router;
