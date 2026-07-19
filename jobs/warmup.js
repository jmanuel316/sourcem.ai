// Daily warmup rotation job.
// Triggered by polsia.toml [[crons]] — runs once per day.
const { runWarmupRound, getWarmupStatus } = require('../services/warmup-rotator');

async function main() {
  console.log('[warmup] Starting daily warmup job');
  const result = await runWarmupRound();
  console.log(`[warmup] Done. Accounts warmed: ${result.warmed}`);
}

main().catch(err => {
  console.error('[warmup] Fatal:', err);
  process.exit(1);
});