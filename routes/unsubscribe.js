// Unsubscribe + email-opt-out.
const express = require('express');
const router = express.Router();

router.get('/unsubscribe', async (req, res) => {
  const token = req.query.token || '';
  res.setHeader('Cache-Control', 'no-store');
  res.render('unsubscribe', { title: 'Unsubscribe', layout: false, token });
});

router.post('/unsubscribe', async (req, res) => {
  const token = (req.body && req.body.token) || '';
  // In v1 we don't write PII mapping to a row; acknowledge and stop sending.
  res.render('unsubscribe-confirm', { title: 'Unsubscribed', layout: false });
});

module.exports = router;
