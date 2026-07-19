// Nightly Crunchbase funding-event ingestion.
// Triggered by polsia.toml [[crons]] at 1:00 AM UTC.
// Requires CRUNCHBASE_API_KEY env var — exits cleanly without it.
require('../db/index');
const { upsertFundingSignal } = require('../db/funding-signals');
const { startRun, finishRun } = require('../db/pipeline-runs');

const CB_API = 'https://api.crunchbase.com/api/v4/searches/funding_rounds';

const FUNDING_TYPES = [
  'seed', 'series_a', 'series_b', 'series_c', 'series_d',
  'series_e', 'series_f', 'series_g', 'angel', 'pre_seed',
  'corporate_round', 'secondary_market', 'post_ipo_equity',
  'post_ipo_debt', 'acquired',
];

async function fetchFundingRounds(apiKey) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 2);
  const afterDate = cutoff.toISOString().split('T')[0];

  const body = {
    field_ids: [
      'uuid', 'short_description', 'funding_type', 'money_raised',
      'announced_on', 'funded_organization_identifier',
    ],
    query: [
      {
        type: 'predicate',
        field_id: 'announced_on',
        operator_id: 'gte',
        values: [afterDate],
      },
      {
        type: 'predicate',
        field_id: 'funding_type',
        operator_id: 'includes',
        values: FUNDING_TYPES,
      },
    ],
    limit: 1000,
  };

  const res = await fetch(`${CB_API}?user_key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Crunchbase API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.entities || [];
}

async function main() {
  const runId = await startRun('funding');
  try {
    const apiKey = process.env.CRUNCHBASE_API_KEY;
    if (!apiKey) {
      console.log('[ingest-funding-signals] CRUNCHBASE_API_KEY not set — skipping ingestion');
      await finishRun(runId, { status: 'success', rows_inserted: 0, rows_skipped: 0 });
      process.exit(0);
    }

    const start = Date.now();
    console.log('[ingest-funding-signals] Starting funding signal ingestion...');

    const entities = await fetchFundingRounds(apiKey);
    console.log(`[ingest-funding-signals] Fetched ${entities.length} funding rounds from Crunchbase`);

    let inserted = 0;
    let skipped = 0;
    let firstInnerError = null;

    for (const entity of entities) {
      const p = entity.properties || {};
      try {
        const row = await upsertFundingSignal({
          company_name: p.funded_organization_identifier?.value || 'Unknown',
          funding_type: p.funding_type || null,
          amount_usd: p.money_raised?.value_usd || null,
          announced_date: p.announced_on || null,
          crunchbase_uuid: p.uuid || entity.uuid || null,
          raw_json: entity,
        });

        if (row) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (err) {
        if (!firstInnerError) firstInnerError = err.message;
        console.warn(`[ingest-funding-signals] upsert error for ${p.uuid || entity.uuid || 'unknown'}: ${err.message}`);
      }
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[ingest-funding-signals] Inserted ${inserted} new, skipped ${skipped} duplicates out of ${entities.length} total`);
    console.log(`[ingest-funding-signals] Done in ${elapsed}s`);

    if (firstInnerError && inserted === 0) {
      console.error(`[ingest-funding-signals] All upserts failed — first error: ${firstInnerError}`);
      await finishRun(runId, { status: 'error', error_message: firstInnerError, rows_inserted: 0, rows_skipped: skipped });
      process.exit(1);
    }
    await finishRun(runId, { rows_inserted: inserted, rows_skipped: skipped, status: 'success' });
    process.exit(0);
  } catch (err) {
    console.error('[ingest-funding-signals] Fatal:', err);
    await finishRun(runId, { status: 'error', error_message: err.message, rows_inserted: 0, rows_skipped: 0 });
    process.exit(1);
  }
}

main();
