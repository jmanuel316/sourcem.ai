// Email sequence generation routes — accepts prospect/company data, returns a 3-step sequence.
const express = require('express');
const router = express.Router();
const { generateSequence } = require('../services/sequence-generator');
const { requireRep } = require('../middleware/auth');
const outboundSequences = require('../db/outbound-sequences');
const sentEmails = require('../db/sent-emails');

// POST /api/sequences/generate
// Body: { prospectName, companyName, role, painPoint, senderName, senderTitle }
router.post('/generate', async (req, res) => {
  const { prospectName, companyName, role, painPoint, senderName, senderTitle } = req.body;
  if (!companyName) return res.status(400).json({ error: 'companyName is required' });

  try {
    const sequence = await generateSequence({ prospectName, companyName, role, painPoint, senderName, senderTitle });
    res.status(200).json({ success: true, sequence });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sequences/summary
router.get('/summary', requireRep, async (req, res) => {
  try {
    const [seq, mail] = await Promise.all([
      outboundSequences.getSummaryForRep(req.repId),
      sentEmails.getReplyMetricsForRep(req.repId),
    ]);
    const totalDispatched = seq.total_dispatched || 0;
    const delivered = seq.delivered || 0;
    const failed = seq.failed || 0;
    const mailSent = mail.sent || 0;
    const replied = mail.replied || 0;
    res.json({
      total_sent: delivered,
      total_dispatched: totalDispatched,
      delivery_rate: totalDispatched === 0 ? 0 : parseFloat(((delivered / totalDispatched) * 100).toFixed(1)),
      reply_rate: mailSent === 0 ? 0 : parseFloat(((replied / mailSent) * 100).toFixed(1)),
      failed_count: failed,
    });
  } catch (err) {
    console.warn('[sequences] summary failed for rep', req.repId, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
