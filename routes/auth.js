// Rep authentication routes — magic link login.
const express = require('express');
const router = express.Router();
const reps = require('../db/reps');
const sessions = require('../db/sessions');
const passwordResets = require('../db/password-resets');
const { sendMagicLink, sendPasswordReset } = require('../services/email-proxy');
const { signToken, COOKIE_NAME, COOKIE_MAX_AGE } = require('../middleware/auth');

router.get('/login', async (req, res) => {
  const { email, token, error, redirect } = req.query;

  // If valid session token in URL params, verify and set cookie
  if (token && email) {
    const session = await sessions.getSession(token);
    if (session && session.email === email) {
      await sessions.markUsed(token);
      const signed = signToken(token);
      res.cookie(COOKIE_NAME, signed, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE * 1000,
        secure: process.env.NODE_ENV === 'production',
      });
      const redir = redirect ? `/${redirect}` : '/digest';
      return res.redirect(redir);
    }
    // Invalid or expired token
    return res.render('login', {
      error: 'This login link has expired or already been used. Please request a new one.',
      email: '',
      sent: false,
    });
  }

  res.render('login', { error: error || null, email: email || '', sent: req.query.sent === 'true' || null });
});

const bcrypt = require('bcrypt');

router.post('/password', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const rep = await reps.getRepByEmail(email);
  if (!rep || !rep.password_hash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, rep.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  const { createPasswordSession } = require('../db/sessions');
  const token = await createPasswordSession(rep.id);
  const signed = signToken(token);
  res.cookie(COOKIE_NAME, signed, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE * 1000,
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ ok: true });
});

router.post('/magic', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const rep = await reps.getRepByEmail(email);
  if (!rep) {
    // Always return success to avoid enumerating-not-found
    return res.json({ sent: true });
  }

  const token = await sessions.createSession(rep.id);
  const sent = await sendMagicLink(email, token);
  if (!sent) {
    return res.status(500).json({ error: 'Failed to send login email. Please try again.' });
  }

  res.json({ sent: true });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const rep = await reps.getRepByEmail(email);
  if (rep) {
    const token = await passwordResets.createResetToken(rep.id);
    await sendPasswordReset(email, token);
  }

  const contentType = req.headers['content-type'] || '';
  const accept = req.headers['accept'] || '';
  const isFormPost = contentType.includes('application/x-www-form-urlencoded');
  const wantsJson = accept.includes('application/json');

  if (isFormPost && !wantsJson) {
    return res.redirect('/auth/forgot-password?sent=true');
  }

  res.json({ ok: true });
});

router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', {
    error: null,
    email: req.query.email || '',
    sent: req.query.sent === 'true',
  });
});

router.get('/reset-password', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.render('reset-password', {
      error: 'Missing or invalid reset link.',
      token: '',
      sent: false,
    });
  }
  res.render('reset-password', { error: null, token, sent: false });
});

router.post('/reset-password', async (req, res) => {
  const { token, password, confirm } = req.body;
  if (!token || !password || password.length < 8) {
    return res.status(400).render('reset-password', {
      error: 'Please provide a token and a password of at least 8 characters.',
      token: token || '',
      sent: false,
    });
  }
  if (confirm !== undefined && confirm !== password) {
    return res.status(400).render('reset-password', {
      error: 'Passwords do not match.',
      token,
      sent: false,
    });
  }

  const row = await passwordResets.getResetToken(token);
  if (!row) {
    return res.status(400).render('reset-password', {
      error: 'This reset link has expired or already been used. Please request a new one.',
      token: '',
      sent: false,
    });
  }

  const hash = await bcrypt.hash(password, 10);
  await reps.updatePassword(row.rep_id, hash);
  await passwordResets.markUsed(token);

  res.clearCookie(COOKIE_NAME);
  res.render('reset-password', { error: null, token: '', sent: true });
});

module.exports = router;