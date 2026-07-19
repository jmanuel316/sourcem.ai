// Polsia Email Proxy — send and receive outbound emails.
const POLSIA_EMAIL_BASE = 'https://polsia.com/api/proxy/email';

async function emailFetch(path, body) {
  const res = await fetch(`${POLSIA_EMAIL_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.POLSIA_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`Email proxy error ${res.status}: ${err.message || err.code || 'unknown'}`);
  }
  return res.json();
}

async function sendEmail({ to, subject, body, html, fromName, replyToEmailId }) {
  const payload = { to, subject, body };
  if (html) payload.html = html;
  if (fromName) payload.from_name = fromName;
  if (replyToEmailId) payload.reply_to_email_id = replyToEmailId;

  const result = await emailFetch('/send', payload);
  return result.email_id || result.id || result;
}

async function getInbox(limit = 50) {
  const res = await fetch(`${POLSIA_EMAIL_BASE}/inbox`, {
    headers: { Authorization: `Bearer ${process.env.POLSIA_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Failed to get inbox: ${res.status}`);
  return res.json();
}

// Get the primary email account from DB — exported for use in outbound routes
const emailAccounts = require('../db/email-accounts');
async function getPrimaryAccount() {
  return emailAccounts.getPrimaryEmailAccount();
}

async function sendMagicLink(email, token) {
  const loginUrl = `https://sourcem.ai/auth/login?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  const subject = 'Your SourcemAI login link';
  const body = `Click to sign in to SourcemAI: ${loginUrl}\n\nThis link expires in 15 minutes.`;
  const html = `<p>Click to sign in to SourcemAI:</p><p><a href="${loginUrl}">${loginUrl}</a></p><p>This link expires in 15 minutes.</p>`;

  try {
    await sendEmail({ to: email, subject, body, html });
    return true;
  } catch (err) {
    console.error('[email-proxy] sendMagicLink failed:', err.message);
    return false;
  }
}

async function sendPasswordReset(email, token) {
  const resetUrl = `https://sourcem.ai/auth/reset-password?token=${encodeURIComponent(token)}`;
  const subject = 'Reset your SourcemAI password';
  const body = `Reset your SourcemAI password: ${resetUrl}\n\nThis link expires in 1 hour.`;
  const html = `<p>Reset your SourcemAI password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`;

  try {
    await sendEmail({ to: email, subject, body, html });
    return true;
  } catch (err) {
    console.error('[email-proxy] sendPasswordReset failed:', err.message);
    return false;
  }
}

module.exports = { sendEmail, getInbox, getPrimaryAccount, sendMagicLink, sendPasswordReset };