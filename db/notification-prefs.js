// Notification preferences per user.
const pool = require('./index');

async function getForRep(repId) {
  const result = await pool.query('SELECT * FROM notification_prefs WHERE rep_id = $1', [repId]);
  return result.rows[0] || { digest_time: '08:00:00', signal_threshold: 5, channels: ['email', 'push'] };
}

async function update(repId, patch) {
  await pool.query(
    `INSERT INTO notification_prefs (rep_id, digest_time, signal_threshold, channels, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (rep_id) DO UPDATE SET
       digest_time = COALESCE(EXCLUDED.digest_time, notification_prefs.digest_time),
       signal_threshold = COALESCE(EXCLUDED.signal_threshold, notification_prefs.signal_threshold),
       channels = COALESCE(EXCLUDED.channels, notification_prefs.channels),
       updated_at = NOW()`,
    [repId, patch.digest_time || null, patch.signal_threshold || null, patch.channels || null]
  );
  return getForRep(repId);
}

module.exports = { getForRep, update };
