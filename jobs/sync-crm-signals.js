require('../db/index');
const { getAllActiveConnections } = require('../db/crm-connections');
const { getValidToken } = require('../services/crm-token-refresh');
const { upsertCrmSignal } = require('../db/crm-signals');
const { startRun, finishRun } = require('../db/pipeline-runs');

const SF_API_VERSION = 'v57.0';

async function syncSalesforce(connection) {
  if (!connection.instance_url) {
    console.warn(`[sync-crm-signals] company ${connection.company_id} Salesforce connection has no instance_url — skipping (reconnect via /api/crm/connect/salesforce)`);
    return { inserted: 0, skipped: 0 };
  }

  const token = await getValidToken(connection.company_id, 'salesforce');
  const base = `${connection.instance_url}/services/data/${SF_API_VERSION}/query`;
  const today = new Date().toISOString().split('T')[0];
  const cutoff14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  let inserted = 0;
  let skipped = 0;

  async function soql(query) {
    const url = `${base}?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Salesforce SOQL error ${resp.status}: ${text}`);
    }
    const data = await resp.json();
    return data.records || [];
  }

  // Recent-activity: open deals modified in last 24h
  const recentDeals = await soql(
    `SELECT Id, Name, Account.Name, StageName, LastModifiedDate, CloseDate, Amount, CreatedDate
     FROM Opportunity
     WHERE LastModifiedDate = LAST_N_DAYS:1 AND IsClosed = FALSE`
  );

  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

  for (const opp of recentDeals) {
    const isNew = new Date(opp.CreatedDate).getTime() >= cutoff24h;
    const signalType = isNew ? 'new_deal' : 'deal_velocity_increase';
    const row = await upsertCrmSignal({
      company_id:   connection.company_id,
      crm_type:     'salesforce',
      account_name: opp.Account?.Name || null,
      deal_id:      opp.Id,
      signal_type:  signalType,
      signal_date:  today,
      raw_json:     opp,
    });
    row ? inserted++ : skipped++;
  }

  // Stall: open deals not touched in 14+ days
  const stalledDeals = await soql(
    `SELECT Id, Name, Account.Name, StageName, LastModifiedDate, CloseDate, Amount
     FROM Opportunity
     WHERE IsClosed = FALSE AND LastModifiedDate < ${cutoff14}`
  );

  for (const opp of stalledDeals) {
    const row = await upsertCrmSignal({
      company_id:   connection.company_id,
      crm_type:     'salesforce',
      account_name: opp.Account?.Name || null,
      deal_id:      opp.Id,
      signal_type:  'deal_stalled',
      signal_date:  today,
      raw_json:     opp,
    });
    row ? inserted++ : skipped++;
  }

  return { inserted, skipped };
}

async function syncHubSpot(connection) {
  const token = await getValidToken(connection.company_id, 'hubspot');
  const today = new Date().toISOString().split('T')[0];
  const cutoff24hAgo = Date.now() - 24 * 60 * 60 * 1000;
  const cutoff14daysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  let inserted = 0;
  let skipped = 0;

  async function searchDeals(body) {
    const resp = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HubSpot search error ${resp.status}: ${text}`);
    }
    const data = await resp.json();
    return data.results || [];
  }

  // Recent-activity: open deals modified in last 24h
  const recentDeals = await searchDeals({
    filterGroups: [{
      filters: [
        { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: cutoff24hAgo },
        { propertyName: 'hs_is_closed',        operator: 'EQ',  value: 'false' },
      ],
    }],
    properties: ['dealname', 'dealstage', 'amount', 'closedate', 'createdate', 'hs_lastmodifieddate'],
    limit: 200,
  });

  for (const deal of recentDeals) {
    const props = deal.properties || {};
    const isNew = props.createdate && new Date(props.createdate).getTime() >= cutoff24hAgo;
    const signalType = isNew ? 'new_deal' : 'deal_velocity_increase';
    const row = await upsertCrmSignal({
      company_id:   connection.company_id,
      crm_type:     'hubspot',
      account_name: null,
      deal_id:      deal.id,
      signal_type:  signalType,
      signal_date:  today,
      raw_json:     deal,
    });
    row ? inserted++ : skipped++;
  }

  // Stall: open deals not modified in 14+ days
  const stalledDeals = await searchDeals({
    filterGroups: [{
      filters: [
        { propertyName: 'hs_lastmodifieddate', operator: 'LT', value: cutoff14daysAgo },
        { propertyName: 'hs_is_closed',        operator: 'EQ', value: 'false' },
      ],
    }],
    properties: ['dealname', 'dealstage', 'amount', 'closedate', 'hs_lastmodifieddate'],
    limit: 200,
  });

  for (const deal of stalledDeals) {
    const row = await upsertCrmSignal({
      company_id:   connection.company_id,
      crm_type:     'hubspot',
      account_name: null,
      deal_id:      deal.id,
      signal_type:  'deal_stalled',
      signal_date:  today,
      raw_json:     deal,
    });
    row ? inserted++ : skipped++;
  }

  return { inserted, skipped };
}

async function main() {
  const runId = await startRun('crm_sync');
  try {
    const start = Date.now();
    const connections = await getAllActiveConnections();

    if (connections.length === 0) {
      console.log('[sync-crm-signals] No active CRM connections — skipping');
      await finishRun(runId, { status: 'success', rows_inserted: 0, rows_skipped: 0 });
      process.exit(0);
    }

    console.log(`[sync-crm-signals] Processing ${connections.length} CRM connection(s)...`);

    let totalInserted = 0;
    let totalSkipped = 0;
    let firstInnerError = null;

    for (const conn of connections) {
      try {
        const syncFn = conn.crm_type === 'salesforce' ? syncSalesforce : syncHubSpot;
        const { inserted, skipped } = await syncFn(conn);
        console.log(`[sync-crm-signals] company=${conn.company_id} crm=${conn.crm_type} inserted=${inserted} skipped=${skipped}`);
        totalInserted += inserted;
        totalSkipped += skipped;
      } catch (err) {
        if (!firstInnerError) firstInnerError = `${conn.crm_type}: ${err.message}`;
        console.warn(`[sync-crm-signals] company=${conn.company_id} crm=${conn.crm_type} error: ${err.message}`);
      }
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[sync-crm-signals] Done — inserted ${totalInserted} new, skipped ${totalSkipped} duplicates in ${elapsed}s`);

    if (firstInnerError && totalInserted === 0) {
      console.error(`[sync-crm-signals] All CRM syncs failed — first error: ${firstInnerError}`);
      await finishRun(runId, { status: 'error', error_message: firstInnerError, rows_inserted: 0, rows_skipped: totalSkipped });
      process.exit(1);
    }
    await finishRun(runId, { rows_inserted: totalInserted, rows_skipped: totalSkipped, status: 'success' });
    process.exit(0);
  } catch (err) {
    console.error('[sync-crm-signals] Fatal:', err);
    await finishRun(runId, { status: 'error', error_message: err.message, rows_inserted: 0, rows_skipped: 0 });
    process.exit(1);
  }
}

main();
