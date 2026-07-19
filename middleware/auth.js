// Rep authentication middleware — cookie-based sessions with HMAC signatures.
const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || 'REDACTED';
const COOKIE_NAME = 'rep_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function signToken(token) {
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(token);
  return `${token}.${hmac.digest('hex')}`;
}

function verifySignedToken(signed) {
  if (!signed) return null;
  const parts = signed.split('.');
  if (parts.length !== 2) return null;
  const [token, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(token).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return token;
}

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

// Attach rep to request if valid session cookie present.
// Does NOT redirect — leaves req.rep undefined if no session.
function optionalRep(req, res, next) {
  const signed = parseCookie(req.headers.cookie || '', COOKIE_NAME);
  const token = verifySignedToken(signed);
  if (!token) return next();

  // Lazy-load to avoid circular require
  const sessions = require('../db/sessions');
  sessions.getSession(token).then(session => {
    if (!session) return next();
    req.rep = { id: session.rep_id, name: session.name, email: session.email, role: session.role, company_id: session.company_id };
    req.repId = session.rep_id;
    next();
  }).catch(() => next());
}

// Require a valid rep session — redirects to /auth/login if missing/invalid.
function requireRep(req, res, next) {
  const signed = parseCookie(req.headers.cookie || '', COOKIE_NAME);
  const token = verifySignedToken(signed);
  if (!token) {
    const redirect = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/login?redirect=${redirect}`);
  }

  const sessions = require('../db/sessions');
  sessions.getSession(token).then(session => {
    if (!session) {
      const redirect = encodeURIComponent(req.originalUrl);
      return res.redirect(`/auth/login?redirect=${redirect}`);
    }
    req.rep = { id: session.rep_id, name: session.name, email: session.email, role: session.role, company_id: session.company_id };
    req.repId = session.rep_id;
    next();
  }).catch(() => {
    const redirect = encodeURIComponent(req.originalUrl);
    res.redirect(`/auth/login?redirect=${redirect}`);
  });
}

// Require admin role — must be called after optionalRep/requireRep has populated req.rep
function requireAdmin(req, res, next) {
  if (!req.rep) {
    const redirect = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/login?redirect=${redirect}`);
  }
  if (req.rep.role !== 'admin') {
    return res.status(403).json({ error: 'admin only' });
  }
  next();
}

module.exports = { optionalRep, requireRep, requireAdmin, signToken, verifySignedToken, COOKIE_NAME, COOKIE_MAX_AGE };