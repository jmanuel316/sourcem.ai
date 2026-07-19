require('../db/index');
const { getAllActiveConnections } = require('../db/crm-connections');
const pool = require('../db/index');

const WEIGHTS = { funding: 3, hiring: 2, crm: 2 };

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchAccount(signals, accounts) {
  const matched = [];
  for (const signal of signals) {
    const norm = normalize(signal.company_name || signal.account_name);
    for (const acct of accounts) {
      if (normalize(acct.company_name) === norm) {
        matched.push({ signal, account: acct });
        break;
      }
    }
  }
  return matched;
}

function buildTopSignal(fundingSignals, hiringSignals, crmSignals) {
  let summary = null;
  let topAmount = 0;

  if (fundingSignals.length > 0) {
    for (const f of fundingSignals) {
      const amt = f.amount_usd || 0;
      if (amt > topAmount) {
        topAmount = amt;
        summary = `${f.funding_type || 'Funding'} raised (${f.amount_usd ? '$' + f.amount_usd.toLocaleString() : 'amount undisclosed'})`;
      }
    }
  }

  if (hiringSignals.length > 0 && !summary) {
    const count = hiringSignals.length;
    summary = `${count} GTM hire${count > 1 ? 's' : ''}`;
  }

  if (crmSignals.length > 0 && !summary) {
    const types = [...new Set(crmSignals.map(s => s.signal_type))];
    summary = `CRM: ${types.join(', ')}`;
  }

  return summary;
}

function getRecommendedAction(score) {
  if (score >= 5) return 'Call now — strong buying signal';
  if (score >= 3) return 'Follow up this week';
  return 'Monitor — weak signal';
}

async function main() {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const connections = await getAllActiveConnections();

  if (connections.length === 0) {
    console.log('[run-scoring-engine] No active CRM connections — skipping');
    process.exit(0);
  }

  console.log(`[run-scoring-engine] Processing ${connections.length} CRM connection(s)...`);

  let totalAccountsScored = 0;
  let totalSignalsAggregated = 0;

  for (const conn of connections) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Clear today's scores for this company
      await client.query('DELETE FROM account_scores WHERE company_id = $1 AND score_date = $2', [conn.company_id, today]);

      // Fetch signals from the last 7 days
      const [fundingRows, hiringRows, crmRows] = await Promise.all([
        client.query(
          `SELECT * FROM funding_signals WHERE ingested_at >= NOW() - INTERVAL '7 days'`),
        client.query(
          `SELECT * FROM hiring_signals WHERE ingested_at >= NOW() - INTERVAL '7 days'`),
        client.query(
          `SELECT * FROM crm_signals WHERE ingested_at >= NOW() - INTERVAL '7 days' AND company_id = $1`,
          [conn.company_id])
      ]);

      const fundingSignals = fundingRows.rows;
      const hiringSignals = hiringRows.rows;
      const crmSignals = crmRows.rows;

      // Get all active accounts for this company
      const acctResult = await client.query('SELECT * FROM accounts WHERE company_id = $1', [conn.company_id]);
      const accounts = acctResult.rows;

      // Build account -> signals map
      const accountSignalsMap = {};
      for (const acct of accounts) {
        accountSignalsMap[acct.id] = { funding: [], hiring: [], crm: [] };
      }

      // Fuzzy match funding signals to accounts by normalized company_name
      for (const sig of fundingSignals) {
        const norm = normalize(sig.company_name);
        const acct = accounts.find(a => normalize(a.company_name) === norm);
        if (acct) accountSignalsMap[acct.id].funding.push(sig);
      }

      // Fuzzy match hiring signals to accounts
      for (const sig of hiringSignals) {
        const norm = normalize(sig.company_name);
        const acct = accounts.find(a => normalize(a.company_name) === norm);
        if (acct) accountSignalsMap[acct.id].hiring.push(sig);
      }

      // Match CRM signals to accounts (already has company_id)
      for (const sig of crmSignals) {
        const norm = normalize(sig.account_name || '');
        const acct = accounts.find(a => normalize(a.company_name) === norm);
        if (acct) accountSignalsMap[acct.id].crm.push(sig);
      }

      let scored = 0;
      for (const [acctId, signals] of Object.entries(accountSignalsMap)) {
        const { funding, hiring, crm } = signals;
        if (funding.length === 0 && hiring.length === 0 && crm.length === 0) continue;

        const composite_score =
          (funding.length * WEIGHTS.funding) +
          (hiring.length * WEIGHTS.hiring) +
          (crm.length * WEIGHTS.crm);

        const signal_types = [];
        if (funding.length > 0) signal_types.push('funding');
        if (hiring.length > 0) signal_types.push('hiring');
        if (crm.length > 0) signal_types.push('crm');

        const top_signal_summary = buildTopSignal(funding, hiring, crm);
        const recommended_action = getRecommendedAction(composite_score);

        const account = accounts.find(a => a.id === parseInt(acctId));
        const contact = account.primary_contact_name || null;
        const contactEmail = account.primary_contact_email || null;

        await client.query(
          `INSERT INTO account_scores
             (company_id, rep_id, account_name, contact_name, contact_email, composite_score, signal_types, top_signal_summary, recommended_action, score_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [conn.company_id, account.rep_id, account.company_name, contact, contactEmail, composite_score, signal_types, top_signal_summary, recommended_action, today]
        );

        scored++;
        totalSignalsAggregated += funding.length + hiring.length + crm.length;
      }

      await client.query('COMMIT');
      console.log(`[run-scoring-engine] company=${conn.company_id} accounts_scored=${scored} signals_aggregated=${totalSignalsAggregated}`);
      totalAccountsScored += scored;
    } catch (err) {
      await client.query('ROLLBACK');
      console.warn(`[run-scoring-engine] company=${conn.company_id} error: ${err.message}`);
    } finally {
      client.release();
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[run-scoring-engine] Done — scored ${totalAccountsScored} account(s), aggregated ${totalSignalsAggregated} signal(s) in ${elapsed}s`);
  process.exit(0);
}

main().catch(err => {
  console.error('[run-scoring-engine] Fatal:', err);
  process.exit(1);
});