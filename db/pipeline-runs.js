const pool = require('./index');

const PIPELINE_NAMES = ['funding', 'hiring', 'crm_sync'];

const EXPECTED_CADENCE_MINUTES = {
  funding:  1440,
  hiring:   1440,
  crm_sync: 1440,
};

async function startRun(pipeline) {
  const result = await pool.query(
    `INSERT INTO signal_pipeline_runs (pipeline, status, started_at)
     VALUES ($1, 'running', NOW())
     RETURNING id`,
    [pipeline]
  );
  return result.rows[0].id;
}

async function finishRun(id, { rows_inserted = 0, rows_skipped = 0, status, error_message = null }) {
  await pool.query(
    `UPDATE signal_pipeline_runs
     SET finished_at = NOW(), rows_inserted = $1, rows_skipped = $2, status = $3, error_message = $4
     WHERE id = $5`,
    [rows_inserted, rows_skipped, status, error_message, id]
  );
}

async function getPipelineHealth() {
  const result = await pool.query(`
    SELECT DISTINCT ON (pipeline)
      id, pipeline, status, started_at, finished_at,
      rows_inserted, rows_skipped, error_message
    FROM signal_pipeline_runs
    WHERE finished_at IS NOT NULL
    ORDER BY pipeline, finished_at DESC
  `);

  const byPipeline = {};
  for (const row of result.rows) {
    byPipeline[row.pipeline] = row;
  }

  const now = Date.now();

  return PIPELINE_NAMES.map(name => {
    const row = byPipeline[name] || null;
    const cadence = EXPECTED_CADENCE_MINUTES[name] || 1440;
    if (!row) {
      return {
        pipeline: name,
        id: null,
        last_run: null,
        status: null,
        rows_inserted: null,
        rows_skipped: null,
        error_message: null,
        is_stale: true,
        expected_cadence_minutes: cadence,
      };
    }
    const is_stale = !row.finished_at || (now - new Date(row.finished_at).getTime()) > 2 * cadence * 60 * 1000;
    return {
      pipeline: name,
      id: row.id,
      last_run: row.finished_at,
      status: row.status,
      rows_inserted: row.rows_inserted,
      rows_skipped: row.rows_skipped,
      error_message: row.error_message,
      is_stale,
      expected_cadence_minutes: cadence,
    };
  });
}

module.exports = { startRun, finishRun, getPipelineHealth };
