const pool = require('../db');
const { sendEmail } = require('./email-proxy');

// Notify admin when a pipeline run is red (status=error OR stale beyond 2x expected cadence).
// Dedupes via pipeline_alert_log UNIQUE(run_id, kind) so a refresh of /admin/pipeline
// can re-evaluate red/green without re-sending the same alert.
async function notifyAdminIfAnyPipelineRed({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) return { notified: 0 };

  const admins = await pool.query(
    `SELECT id, name, email FROM reps WHERE role = 'admin' AND is_active = TRUE`
  ).then(r => r.rows).catch(err => {
    console.error('[pipeline-alert-notifier] admin lookup failed:', err.message);
    return [];
  });
  if (admins.length === 0) {
    console.warn('[pipeline-alert-notifier] no active admin reps — skipping alerts');
    return { notified: 0 };
  }

  let notified = 0;
  for (const row of rows) {
    const isError = row.status === 'error';
    const isStale = row.is_stale === true;
    if (!isError && !isStale) continue;
    if (!row.id) continue;

    const kind = isError ? 'error' : 'stale';

    let insertedThisTime = false;
    try {
      const dedupResult = await pool.query(
        `INSERT INTO pipeline_alert_log (run_id, pipeline, kind)
         VALUES ($1, $2, $3)
         ON CONFLICT (run_id, kind) DO NOTHING
         RETURNING id`,
        [row.id, row.pipeline, kind]
      );
      insertedThisTime = dedupResult.rows.length > 0;
    } catch (err) {
      console.error(`[pipeline-alert-notifier] dedup insert failed for ${row.pipeline} (${kind}): ${err.message}`);
      continue;
    }
    if (!insertedThisTime) continue;

    await sendAlertEmailForRun(row, kind, admins).catch(err => {
      console.error(`[pipeline-alert-notifier] sendAlertEmailForRun failed for ${row.pipeline} (${kind}): ${err.message}`);
    });
    notified++;
  }

  return { notified };
}

async function sendAlertEmailForRun(row, kind, admins) {
  const subject = `[SourcemAI] Pipeline ${row.pipeline} ${kind}`;
  const lines = [
    `Pipeline: ${row.pipeline}`,
    `Status: ${kind}`,
    `Last run: ${row.last_run ? new Date(row.last_run).toISOString() : 'never'}`,
    `Expected cadence: ${row.expected_cadence_minutes || 1440} minutes`,
  ];
  if (kind === 'error' && row.error_message) {
    lines.push(`Error: ${row.error_message}`);
  }
  lines.push('', 'Investigate at /admin/pipeline');
  const body = lines.join('\n');

  for (const admin of admins) {
    try {
      await sendEmail({ to: admin.email, subject, body });
    } catch (err) {
      console.error(`[pipeline-alert-notifier] sendEmail to ${admin.email} failed: ${err.message}`);
    }
  }
}

module.exports = { notifyAdminIfAnyPipelineRed };
