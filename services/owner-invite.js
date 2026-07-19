// Owner-targeted credential invite — sends login + reset link to an out-of-band
// address resolved by the operator, not the rep whose token minted the reset.
const { sendEmail } = require('./email-proxy');

async function sendOwnerInvite({ ownerEmail, loginEmail, password, loginUrl, resetUrl }) {
  const subject = 'Your SourcemAI admin credentials';
  const body =
    `SourcemAI admin credentials\n\n` +
    `Login email: ${loginEmail}\n` +
    `Password: ${password}\n` +
    `Login URL: ${loginUrl}\n` +
    `Rotate-after-first-login reset link: ${resetUrl}\n\n` +
    `Sign in at ${loginUrl} and rotate the password immediately.`;
  const html =
    `<p>SourcemAI admin credentials</p>` +
    `<p><strong>Login email:</strong> ${loginEmail}<br>` +
    `<strong>Password:</strong> ${password}<br>` +
    `<strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a><br>` +
    `<strong>Rotate-after-first-login reset link:</strong> <a href="${resetUrl}">${resetUrl}</a></p>` +
    `<p>Sign in at <a href="${loginUrl}">${loginUrl}</a> and rotate the password immediately.</p>`;

  try {
    const receipt = await sendEmail({ to: ownerEmail, subject, body, html });
    const emailId = receipt && typeof receipt === 'object' ? (receipt.email_id || receipt.id) : receipt;
    return { ok: true, delivered: Boolean(emailId), emailId: emailId || null };
  } catch (err) {
    console.error('[owner-invite] sendOwnerInvite failed:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendOwnerInvite };
