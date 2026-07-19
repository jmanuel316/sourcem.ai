// Signal processor — cron entry point.
// Runs nightly: fetches external signals (Crunchbase, LinkedIn Jobs) then scores + generates digests.
require('../db/index'); // ensure DATABASE_URL available
const pool = require('../db/index');
const { scoreAllAccounts } = require('../services/signal-scorer');
const { generateAllDigests } = require('../services/digest-generator');

async function main() {
  console.log('[signal-processor] Starting nightly run...');
  const start = Date.now();

  try {
    // 1. Fetch external signals (stub for v1 — replace with real API calls)
    const ingested = await ingestExternalSignals();
    console.log(`[signal-processor] Ingested ${ingested} signals`);

    // 2. Score all accounts
    const scored = await scoreAllAccounts();
    console.log(`[signal-processor] Scored ${scored.scored} accounts`);

    // 3. Generate digest for each rep
    const digests = await generateAllDigests();
    console.log(`[signal-processor] Generated ${digests.length} digests`);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[signal-processor] Done in ${elapsed}s`);
    process.exit(0);
  } catch (err) {
    console.error('[signal-processor] Fatal:', err);
    process.exit(1);
  }
}

// Stub: in v1, signals are injected manually via /api/signals or seeded.
// Real implementation would call Crunchbase / LinkedIn Jobs APIs here.
async function ingestExternalSignals() {
  // Check for CRUNCHBASE_API_KEY in env to enable real integration
  if (!process.env.CRUNCHBASE_API_KEY) {
    console.log('[signal-processor] Crunchbase API key not set — skipping external ingest (use /api/signals for manual entry)');
    return 0;
  }

  // TODO: call Crunchbase API for funding events
  // TODO: call LinkedIn Jobs API for hiring signals
  return 0;
}

main();