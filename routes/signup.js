// Public signup — email + password + org name; creates rep (admin) + org + 14-day trial.
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const pool = require('../db');
const orgsDb = require('../db/orgs');
const subsDb = require('../db/subscriptions');
const onboardingDb = require('../db/onboarding-progress');
const audit = require('../services/audit');
const tEmail = require('../services/transactional-email');
const { signToken, COOKIE_NAME, COOKIE_MAX_AGE } = require('../middleware/auth');
const sessionsDb = require('../db/sessions');
const rateLimit = require('../middleware/rate-limit');

// Password policy: 10+ chars, must contain a letter and a digit.
function validPassword(p) {
  return typeof p === 'string' && p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);
}

router.get('/signup', (_req, res) => {
  res.render('signup', { title: 'Sign up', layout: false });
});

const signupLimiter = rateLimit.byIp(3, 60 * 1000);
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { email, password, org_name } = req.body || {};
    if (!email || !password || !org_name) {
      return res.status(400).render('signup', { title: 'Sign up', layout: false, error: 'All fields are required.' });
    }
    if (!validPassword(password)) {
      return res.status(400).render('signup', { title: 'Sign up', layout: false, error: 'Password must be at least 10 characters and contain a letter and a digit.' });
    }
    const existing = await pool.query('SELECT id FROM reps WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows[0]) {
      return res.status(400).render('signup', { title: 'Sign up', layout: false, error: 'An account with that email already exists. Log in instead.' });
    }
    const org = await orgsDb.createOrg({ name: org_name, billing_email: email });
    const hash = await bcrypt.hash(password, 10);
    const rep = (await pool.query(
      `INSERT INTO reps (name, email, role, company_id, org_id, password_hash) VALUES ($1,$2,'admin',$3,$4,$5) RETURNING *`,
      [email.split('@')[0], email, org.id, org.id, hash])).rows[0];
    await pool.query(
      `INSERT INTO org_memberships (org_id, rep_id, role) VALUES ($1,$2,'admin')`,
      [org.id, rep.id]);
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await subsDb.upsert({ org_id: org.id, plan: 'solidify', status: 'trialing', trial_ends_at: trialEnd, seat_count: 1 });
    await onboardingDb.ensure(org.id);
    await audit.record({ req, rep: { id: rep.id, company_id: org.id } }, 'signup', { target_type: 'org', target_id: org.id });

    // Create session + redirect to onboarding.
    const token = await sessionsDb.createPasswordSession(rep.id);
    const signed = signToken(token);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${signed}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}; Max-Age=${COOKIE_MAX_AGE}`);
    // Best-effort welcome email.
    tEmail.send(email, 'welcome', { name: rep.name }, { unsubscribeUrl: `https://sourcem.ai/unsubscribe?token=${Buffer.from(email).toString('base64url')}` });
    res.redirect('/onboarding');
  } catch (err) {
    console.error('[signup] error:', err.message);
    res.status(500).render('err/500', { title: 'Error', layout: false, message: 'Signup failed. Please try again.' });
  }
});

module.exports = router;
