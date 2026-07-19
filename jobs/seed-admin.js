process.on('uncaughtException', (err) => { console.error(err.message); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error(err.message); process.exit(1); });

const bcrypt = require('bcrypt');
const pool = require('../db/index');
const reps = require('../db/reps');
const passwordResets = require('../db/password-resets');
const { sendOwnerInvite } = require('../services/owner-invite');

const ADMIN_LOGIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@sourcemai.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // plaintext (one-time bootstrap use only)
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH; // pre-hashed bcrypt

function parseOwnerEmailArg(argv) {
  const idx = argv.indexOf('--owner-email');
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  return process.env.OWNER_EMAIL || null;
}

(async () => {
  try {
    if (!ADMIN_PASSWORD && !ADMIN_PASSWORD_HASH) {
      console.error('[seed-admin] admin password required: set ADMIN_PASSWORD or ADMIN_PASSWORD_HASH');
      await pool.end();
      process.exit(1);
    }

    const admin = await reps.upsertRep({ name: 'Admin', email: ADMIN_LOGIN_EMAIL, role: 'admin' });

    let hashToStore = ADMIN_PASSWORD_HASH;
    let plaintextForInvite = null;
    if (!hashToStore && ADMIN_PASSWORD) {
      hashToStore = await bcrypt.hash(ADMIN_PASSWORD, 10);
      plaintextForInvite = ADMIN_PASSWORD;
    }

    const existing = await reps.getRepByEmail(ADMIN_LOGIN_EMAIL);
    if (!(existing && existing.password_hash && hashToStore && await bcrypt.compare(plaintextForInvite || '', existing.password_hash))) {
      await reps.updatePassword(admin.id, hashToStore);
    }

    const ownerEmail = parseOwnerEmailArg(process.argv.slice(2));
    if (!ownerEmail) {
      console.log('[seed-admin] no owner email set — admin password set without invite');
      await pool.end();
      process.exit(0);
    }

    const resetToken = await passwordResets.createResetToken(admin.id);
    const resetUrl = `https://sourcem.ai/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
    const loginUrl = 'https://sourcem.ai/auth/login';

    const inviteResult = await sendOwnerInvite({
      ownerEmail, loginEmail: ADMIN_LOGIN_EMAIL,
      password: plaintextForInvite || 'use-reset-link',
      loginUrl, resetUrl
    });

    console.log('OWNER INVITE →', { ownerEmail, loginEmail: ADMIN_LOGIN_EMAIL, loginUrl, resetUrl, delivered: inviteResult.delivered === true });

    await pool.end();
    process.exit(inviteResult.ok ? 0 : 1);
  } catch (err) {
    console.error('seed-admin failed:', err.message);
    try { await pool.end(); } catch (_) {}
    process.exit(1);
  }
})();
