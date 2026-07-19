// Transactional email templates.
// Each template is a function (data) => { subject, text, html, headers? }
// Render with a shared layout (white bg + gold accent).
const THEMED_LAYOUT = (body) => `<!doctype html><html><body style="margin:0;background:#fff;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#1a1a1a;">
${body}
</body></html>`;

const ACCENT = '#d4a047';

function layout(inner) {
  return THEMED_LAYOUT(`
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="border-bottom:2px solid ${ACCENT};padding-bottom:12px;margin-bottom:24px;">
        <strong style="color:${ACCENT};">SourcemAI</strong>
      </div>
      ${inner}
      <div style="margin-top:32px;font-size:12px;color:#888;">
        You're receiving this because you signed up for SourcemAI.<br>
        <a href="{{UNSUBSCRIBE}}" style="color:#888;">Unsubscribe</a> ·
        <a href="https://sourcem.ai/privacy" style="color:#888;">Privacy</a>
      </div>
    </div>
  `);
}

const templates = {
  welcome: (data) => ({
    subject: 'Welcome to SourcemAI',
    text: `Hi ${data.name}, your SourcemAI account is ready. Visit https://sourcem.ai/digest to get started.`,
    html: layout(`<h1>Welcome to SourcemAI</h1><p>Hi ${escapeHtml(data.name)}, your account is ready. <a href="https://sourcem.ai/digest">Open your digest →</a></p>`)
  }),
  email_verification: (data) => ({
    subject: 'Verify your SourcemAI email',
    text: `Verify your email: https://sourcem.ai/auth/verify?token=${data.token}`,
    html: layout(`<p>Click to verify your email:</p><p><a href="https://sourcem.ai/auth/verify?token=${data.token}">Verify email</a> (expires in 24 hours)</p>`)
  }),
  trial_started: (data) => ({
    subject: 'Your Solidify trial is live',
    text: `Hi ${data.name}, your 14-day Solidify trial starts today and ends ${formatDate(data.ends_at)}.`,
    html: layout(`<h1>Your trial is live</h1><p>Hi ${escapeHtml(data.name)}, your 14-day Solidify trial ends <strong>${formatDate(data.ends_at)}</strong>.</p>`)
  }),
  trial_ending_soon: (data) => ({
    subject: `Your trial ends in ${data.days_left} day${data.days_left === 1 ? '' : 's'}`,
    text: `Add billing details to keep Solidify after your trial: https://sourcem.ai/settings/billing`,
    html: layout(`<p>Your Solidify trial ends in <strong>${data.days_left} day${data.days_left === 1 ? '' : 's'}</strong>. <a href="https://sourcem.ai/settings/billing">Add a card →</a></p>`)
  }),
  trial_expired: (data) => ({
    subject: 'Your trial has ended',
    text: `Your Solidify trial expired. Add a card at https://sourcem.ai/settings/billing to keep access.`,
    html: layout(`<p>Your Solidify trial expired. <a href="https://sourcem.ai/settings/billing">Add a card</a> to keep access and your digest will resume overnight.</p>`)
  }),
  team_invitation: (data) => ({
    subject: `${data.inviter_name} invited you to ${data.org}`,
    text: `Accept the invitation: ${data.link}`,
    html: layout(`<p><strong>${escapeHtml(data.inviter_name)}</strong> invited you to join <strong>${escapeHtml(data.org)}</strong> on SourcemAI.</p><p><a href="${data.link}>Accept invitation →</a></p>`)
  }),
  password_reset: (data) => ({
    subject: 'Reset your SourcemAI password',
    text: `Reset your password: https://sourcem.ai/auth/reset?token=${data.token}`,
    html: layout(`<p>Reset your password: <a href="https://sourcem.ai/auth/reset?token=${data.token}">Reset password</a> (valid 1 hour).</p>`)
  }),
  digest_delivery: (data) => ({
    subject: `Your ${data.count} ranked accounts for ${data.date}`,
    text: `Open your digest: https://sourcem.ai/digest`,
    html: layout(`<p>${data.count} accounts ranked for you today. <a href="https://sourcem.ai/digest">Open digest →</a></p>`)
  }),
  signal_alert: (data) => ({
    subject: `New signal on ${data.account}`,
    text: `${data.account} triggered a ${data.signal_type} signal. Open: https://sourcem.ai/digest/account/${data.account_id}`,
    html: layout(`<p><strong>${escapeHtml(data.account)}</strong> just triggered a <strong>${escapeHtml(data.signal_type)}</strong> signal. <a href="https://sourcem.ai/digest/account/${data.account_id}">View →</a></p>`)
  }),
  payment_received_invoice: (data) => ({
    subject: `Receipt for your SourcemAI payment`,
    text: `Amount: $${(data.amount / 100).toFixed(2)}. Invoice: ${data.invoice_url}`,
    html: layout(`<p>Thanks — we received your payment of <strong>$${(data.amount / 100).toFixed(2)}</strong>. <a href="${data.invoice_url}">View invoice</a>.</p>`)
  }),
  payment_failed_dunning: (data) => ({
    subject: 'Action needed: your SourcemAI payment failed',
    text: `Your card was declined. Update billing: https://sourcem.ai/settings/billing`,
    html: layout(`<p>Your most recent payment didn't go through. <a href="https://sourcem.ai/settings/billing">Update your payment method →</a></p>`)
  }),
  subscription_canceled: (data) => ({
    subject: 'Your SourcemAI subscription is canceled',
    text: `Access continues until ${formatDate(data.period_end)}.`,
    html: layout(`<p>Your subscription is canceled. You'll keep access until <strong>${formatDate(data.period_end)}</strong> — your data is preserved.</p>`)
  }),
  plan_changed: (data) => ({
    subject: `Plan updated — ${data.plan}`,
    text: `Your plan is now ${data.plan}.`,
    html: layout(`<p>Your plan is now <strong>${data.plan}</strong>.</p>`)
  }),
  account_deletion_confirmation: (data) => ({
    subject: 'Your SourcemAI account is scheduled for deletion',
    text: `Your account will be permanently deleted on ${formatDate(data.delete_at)}. Cancel within 7 days: ${data.cancel_url}`,
    html: layout(`<p>Your account will be permanently deleted on <strong>${formatDate(data.delete_at)}</strong>. <a href="${data.cancel_url}">Cancel deletion</a> if this was a mistake.</p>`)
  })
};

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" }[c]));
}

function formatDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}

// Render a template by name; returns { subject, html, text }
function render(name, data = {}) {
  const fn = templates[name];
  if (!fn) throw new Error(`Unknown email template: ${name}`);
  const out = fn(data);
  return out;
}

function applyUnsubscribe(html, unsubscribeUrl) {
  return html.replace('{{UNSUBSCRIBE}}', escapeHtml(unsubscribeUrl));
}

async function send(to, name, data, { unsubscribeUrl } = {}) {
  const out = render(name, data);
  const html = unsubscribeUrl ? applyUnsubscribe(out.html, unsubscribeUrl) : out.html;
  const emailProxy = require('./email-proxy');
  try {
    await emailProxy.sendEmail({ to, subject: out.subject, body: out.text || out.subject, html });
  } catch (err) {
    console.warn('[email] send failed (ok in dev):', err.message);
  }
}

module.exports = { render, send, applyUnsubscribe };
