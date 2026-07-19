// Daily DB backup. Runs pg_dump against DATABASE_URL, uploads to SOURCEMAI_BACKUP_BUCKET.
// Skips gracefully when env vars are unset (dev environments).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  const bucket = process.env.SOURCEMAI_BACKUP_BUCKET;
  if (!dbUrl || !bucket) {
    console.log('[db-backup] DATABASE_URL or SOURCEMAI_BACKUP_BUCKET not set — skipping.');
    await pool.query(
      `INSERT INTO db_backup_log (ok, destination, error) VALUES (false, $1, 'not-configured')`,
      [bucket || null]
    ).catch(()=>{});
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join('/tmp', `backup-${stamp}.dump`);
  try {
    execSync(`pg_dump "${dbUrl}" -Fc -f "${file}"`, { stdio: 'pipe' });
    const size = fs.statSync(file).size;
    execSync(`aws s3 cp "${file}" "s3://${bucket}/${path.basename(file)}"`, { stdio: 'pipe' });
    fs.unlinkSync(file);
    await pool.query(
      `INSERT INTO db_backup_log (ok, size_bytes, destination) VALUES (true, $1, $2)`,
      [size, `s3://${bucket}/${stamp}/`]
    );
    console.log(`[db-backup] ok: ${size} bytes → ${bucket}`);
  } catch (err) {
    await pool.query(
      `INSERT INTO db_backup_log (ok, error) VALUES (false, $1)`,
      [String(err.message).slice(0, 500)]
    ).catch(()=>{});
    throw err;
  }
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch(err => {
    console.error('[db-backup] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { run };
