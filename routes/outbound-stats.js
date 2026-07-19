// Outbound read-only stats routes — recent emails, reply feed, aggregates.
// Used by the dashboard UI.
const express = require('express');
const router = express.Router();
const replies = require('../db/replies');
const sentEmails = require('../db/sent-emails');
const prospects = require('../db/prospects');

router.get('/emails', async (req, res) => {
  const { limit = 50 } = req.query;
  try {
    const pool = require('../db/index');
    const result = await pool.query(
      `SELECT se.*, p.name as prospect_name, p.email as prospect_email
       FROM sent_emails se
       LEFT JOIN prospects p ON se.prospect_id = p.id
       ORDER BY se.sent_at DESC LIMIT $1`,
      [parseInt(limit, 10)]
    );
    res.json({ emails: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/replies', async (req, res) => {
  const { limit = 20 } = req.query;
  try {
    const pool = require('../db/index');
    const result = await pool.query(
      `SELECT r.*, p.name as prospect_name, p.email as prospect_email
       FROM replies r
       LEFT JOIN sent_emails se ON r.sent_email_id = se.id
       LEFT JOIN prospects p ON se.prospect_id = p.id
       ORDER BY r.created_at DESC LIMIT $1`,
      [parseInt(limit, 10)]
    );
    res.json({ replies: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;