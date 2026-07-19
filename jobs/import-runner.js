// Async import runner — drains queued import_runs in batches.
// Triggered by polsia.toml [[crons]] — runs every minute.
const importRuns = require('../db/import-runs');
const { parseCSV, normalizeRow, dedupAndInsert } = require('../services/import');
const pool = require('../db');

const BATCH_SIZE = 500;

async function processRun(run) {
  const runId = run.id;
  console.log(`[import-runner] Processing run ${runId}`);
  await pool.query(`UPDATE import_runs SET status='processing' WHERE id=$1`, [runId]);
  const payload = run.payload || {};
  const text = payload.text || '';
  const mapping = payload.mapping || {};
  const repId = payload.rep_id;
  const sourceTag = payload.sourceTag || 'csv-async';
  if (!text || !repId) {
    await importRuns.fail(runId, 'missing-payload');
    return;
  }
  const rows = parseCSV(text);
  const total = rows.length;
  await pool.query(`UPDATE import_runs SET row_count=$2 WHERE id=$1`, [runId, total]);

  const errors = [];
  let inserted = 0, updated = 0, processed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE).map(r => normalizeRow(r, mapping));
    const stats = await dedupAndInsert({ org_id: run.org_id, rep_id: repId, rows: chunk, source: sourceTag });
    inserted += stats.inserted; updated += stats.updated;
    errors.push(...stats.errors);
    processed += chunk.length;
    const progress = Math.round((processed / total) * 100);
    await importRuns.setProgress(runId, { progress, processed_count: processed });
  }

  await importRuns.complete(runId, {
    row_count: total,
    inserted_count: inserted,
    updated_count: updated,
    error_count: errors.length,
    errors
  });
  console.log(`[import-runner] Done run ${runId}: ${inserted} inserted, ${updated} updated, ${errors.length} errors`);
}

async function main() {
  const queued = await importRuns.listQueued(5);
  if (!queued.length) { console.log('[import-runner] No queued runs.'); return; }
  for (const run of queued) {
    try { await processRun(run); }
    catch (err) {
      console.error('[import-runner] Error processing run', run.id, err);
      await importRuns.fail(run.id, err.message || 'runner-error').catch(() => {});
    }
  }
}

main().catch(err => {
  console.error('[import-runner] Fatal:', err);
  process.exit(1);
});
