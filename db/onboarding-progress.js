// Onboarding progress — wizard state per org.
const pool = require('./index');

const STEPS = ['welcome', 'choose_integrations', 'connect_source', 'verify_digest', 'invite_teammates'];

async function ensure(orgId) {
  await pool.query(
    `INSERT INTO onboarding_progress (org_id, current_step, completed_steps)
     VALUES ($1, 'welcome', ARRAY[]::TEXT[])
     ON CONFLICT (org_id) DO NOTHING`,
    [orgId]
  );
  const result = await pool.query('SELECT * FROM onboarding_progress WHERE org_id = $1', [orgId]);
  return result.rows[0];
}

async function advance(orgId, step) {
  const row = await ensure(orgId);
  const completed = row.completed_steps || [];
  if (!completed.includes(step)) completed.push(step);
  const idx = STEPS.indexOf(step);
  const nextStep = STEPS[Math.min(idx + 1, STEPS.length - 1)];
  await pool.query(
    `UPDATE onboarding_progress
     SET current_step = $2, completed_steps = $3, updated_at = NOW()
     WHERE org_id = $1`,
    [orgId, nextStep, completed]
  );
  return ensure(orgId);
}

module.exports = { STEPS, ensure, advance };
