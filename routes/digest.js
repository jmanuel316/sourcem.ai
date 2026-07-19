// Daily digest API — serve ranked account recommendations to the PWA.
const express = require('express');
const router = express.Router();
const { requireRep } = require('../middleware/auth');
const digestBatches = require('../db/digest-batches');
const signals = require('../db/signals');
const accounts = require('../db/accounts');
const repSettings = require('../db/rep-settings');
const outboundSequences = require('../db/outbound-sequences');

router.use(requireRep);

router.get('/today', async (req, res) => {
  const repId = req.repId;
  try {
    const digest = await digestBatches.getTodaysDigest(repId);
    if (!digest) return res.json({ digest: null, entries: [], message: 'No digest published for today' });
    res.json(digest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ranked', async (req, res) => {
  const repId = req.repId;
  try {
    const accounts = await signals.getRankedAccounts({
      repId,
      minScore: parseInt(req.query.min_score, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
    });
    const latestSeqs = await outboundSequences.getLatestSequenceForAccounts(repId, accounts.map(a => a.id));
    const seqByAccount = new Map(latestSeqs.map(s => [s.account_id, s]));
    for (const acc of accounts) {
      const seq = seqByAccount.get(acc.id);
      if (!seq || seq.webhook_status === null || seq.webhook_status === undefined) {
        acc.sequence_status = null;
        acc.sequence_channel = null;
        acc.sequence_updated_at = null;
      } else if (seq.webhook_status >= 200 && seq.webhook_status < 300) {
        acc.sequence_status = 'sent';
        acc.sequence_channel = seq.channel;
        acc.sequence_updated_at = seq.created_at ? new Date(seq.created_at).toISOString() : null;
      } else {
        acc.sequence_status = 'failed';
        acc.sequence_channel = seq.channel;
        acc.sequence_updated_at = seq.created_at ? new Date(seq.created_at).toISOString() : null;
      }
    }
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const CSV_HEADER = ['account_name', 'domain', 'composite_score', 'top_signal_source', 'last_signal_date', 'reply_rate', 'last_reply_date'];

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

router.get('/export', async (req, res) => {
  const repId = req.repId;
  try {
    const rows = await signals.getRankedAccountsForExport({ repId, minScore: 1, limit: 1000 });
    const lines = [CSV_HEADER.join(',')];
    for (const r of rows) {
      const dateIso = r.last_signal_date ? new Date(r.last_signal_date).toISOString().slice(0, 10) : '';
      const replyRateStr = r.reply_rate === null || r.reply_rate === undefined
        ? ''
        : `${Math.round(parseFloat(r.reply_rate) * 100)}%`;
      const lastReplyIso = r.last_reply_date ? new Date(r.last_reply_date).toISOString().slice(0, 10) : '';
      lines.push([
        csvEscape(r.company_name),
        csvEscape(r.domain),
        csvEscape(r.score),
        csvEscape(r.top_signal_source),
        csvEscape(dateIso),
        csvEscape(replyRateStr),
        csvEscape(lastReplyIso),
      ].join(','));
    }
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sourcemai-ranked-${today}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    console.warn('[digest] CSV export failed for rep', repId, err.message);
    res.status(500).json({ error: err.message });
  }
});

const SEQUENCE_CHANNELS = ['cold_email', 'linkedin'];

router.post('/sequence', async (req, res) => {
  const repId = req.repId;
  const { account_ids, channel } = req.body || {};
  if (!Array.isArray(account_ids) || account_ids.length === 0) {
    return res.status(400).json({ error: 'account_ids must be a non-empty array' });
  }
  if (!SEQUENCE_CHANNELS.includes(channel)) {
    return res.status(400).json({ error: `channel must be one of ${SEQUENCE_CHANNELS.join(', ')}` });
  }
  const intIds = account_ids.map(v => parseInt(v, 10)).filter(n => Number.isInteger(n) && n > 0);
  if (intIds.length === 0) return res.status(400).json({ error: 'no valid account ids' });

  try {
    const repOverride = channel === 'cold_email'
      ? await repSettings.getSetting(repId, 'cold_email_webhook')
      : await repSettings.getSetting(repId, 'linkedin_sequence_webhook');
    const webhookUrl = repOverride || (channel === 'cold_email'
      ? process.env.COLD_EMAIL_WEBHOOK_URL
      : process.env.LINKEDIN_SEQUENCE_WEBHOOK_URL);

    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhook not configured' });
    }

    const accountRows = [];
    for (const id of intIds) {
      const account = await accounts.getAccountById(id);
      if (!account || account.rep_id !== repId) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const latestScore = await signals.getLatestScore(id);
      accountRows.push({
        id: account.id,
        company_name: account.company_name,
        domain: account.domain,
        score: latestScore ? latestScore.score : 0,
        top_signal_source: latestScore ? latestScore.top_signals?.[0]?.signal_type || 'mixed' : 'mixed',
      });
    }

    const payload = JSON.stringify({
      rep_id: repId,
      channel,
      accounts: accountRows,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let webhookStatus = null;
    let responseBody = '';
    try {
      const wh = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: controller.signal,
      });
      webhookStatus = wh.status;
      responseBody = (await wh.text()).slice(0, 2048);
    } catch (whErr) {
      console.error('[digest] Sequence webhook failed:', channel, whErr.message);
      clearTimeout(timeout);
      const log = await outboundSequences.createOutboundSequenceLog({
        repId, channel, accountIds: intIds, webhookUrl, webhookStatus: null, responseBody: `error: ${whErr.message}`,
      });
      return res.json({ status: 'failed', webhook_status: null, error: whErr.message, log });
    }
    clearTimeout(timeout);

    const log = await outboundSequences.createOutboundSequenceLog({
      repId, channel, accountIds: intIds, webhookUrl, webhookStatus, responseBody,
    });

    if (webhookStatus >= 200 && webhookStatus < 300) {
      return res.json({ status: 'sent', log });
    }
    return res.json({ status: 'failed', webhook_status: webhookStatus, error: `webhook returned ${webhookStatus}`, log });
  } catch (err) {
    console.warn('[digest] Sequence creation failed for rep', repId, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:entryId/action', async (req, res) => {
  if (!req.rep) return res.status(401).json({ error: 'not authenticated' });
  const { status } = req.body;
  if (!status || !['actioned', 'scheduled'].includes(status)) {
    return res.status(400).json({ error: 'status must be actioned or scheduled' });
  }
  try {
    const entryId = parseInt(req.params.entryId, 10);
    // Verify entry belongs to a batch for this rep
    const entry = await digestBatches.getEntryById(entryId);
    if (!entry) return res.status(404).json({ error: 'entry not found' });

    const batch = await digestBatches.getBatchById(entry.batch_id);
    if (!batch || batch.rep_id !== req.repId) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const row = await digestBatches.markEntryActioned(entryId, status);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/accounts/:accountId/signals', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (!accountId) return res.status(400).json({ error: 'invalid account id' });
  try {
    const account = await accounts.getAccountById(accountId);
    if (!account || account.rep_id !== req.repId) return res.status(404).json({ error: 'not found' });
    const [rawSignals, latestScore] = await Promise.all([
      signals.getSignalsByAccount(accountId, { limit: 30 }),
      signals.getLatestScore(accountId),
    ]);
    res.json({ account, score: latestScore, signals: rawSignals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual trigger: generate + publish today's digest for authenticated rep
router.post('/generate', async (req, res) => {
  const repId = req.repId;
  const { scoreOverride } = req.body;
  try {
    const accounts = await signals.getRankedAccounts({ repId, minScore: scoreOverride || 1, limit: 20 });
    const today = new Date().toISOString().split('T')[0];
    const batch = await digestBatches.getOrCreateBatch(repId, today);

    const pool = require('../db/index');
    await pool.query('DELETE FROM digest_entries WHERE batch_id = $1', [batch.id]);

    const entries = accounts.map(a => ({
      account_id: a.id,
      contact_id: a.contact_id || null,
      score: a.score,
      priority: a.priority || 'medium',
      why_one_liner: buildWhyOneLiner(a),
      recommended_action: buildRecommendedAction(a),
    }));

    const inserted = await digestBatches.insertEntries(batch.id, entries);
    await digestBatches.publishBatch(batch.id);

    res.json({ batch, entries: inserted.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildWhyOneLiner(account) {
  const parts = [];
  if (account.funding_score > 0) parts.push(`Recent funding detected (${account.funding_score}pts)`);
  if (account.hiring_score > 0) parts.push(`Hiring surge in GTM roles (${account.hiring_score}pts)`);
  if (account.crm_score > 0) parts.push(`CRM activity spike (${account.crm_score}pts)`);
  if (account.email_score > 0) parts.push(`Email engagement (${account.email_score}pts)`);
  if (!parts.length) return `${account.company_name} showed elevated intent signals today.`;
  return `${account.company_name}: ${parts.join(' · ')}.`;
}

function buildRecommendedAction(account) {
  if (account.funding_score >= 3) return `Follow up on active deal — funding round means new budget.`;
  if (account.hiring_score >= 2) return `Reach out — scaling GTM team, likely buying enablement tools.`;
  if (account.crm_score >= 2) return `Check in — CRM activity suggests decision process active.`;
  if (account.email_score >= 3) return `Reach out now — prospect opened and clicked recent email.`;
  return `Send outreach — account shows buying intent signals.`;
}

module.exports = router;