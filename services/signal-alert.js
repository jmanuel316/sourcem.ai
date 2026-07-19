// Signal alert engine — sends in-app + Web Push alerts when a high-scoring
// account receives a new signal. Dedupes per account+signal_type within a
// 1-hour window so rapid successive signals don't spam the rep.
const webpush = require('web-push');
const signalsDb = require('../db/signals');
const accountsDb = require('../db/accounts');
const digestBatches = require('../db/digest-batches');
const signalAlertsDb = require('../db/signal-alerts');

const HIGH_PRIORITY_MIN_SCORE = 5;
const COOLDOWN_MINUTES = 60;
const SIGNAL_TYPE_LABELS = {
  funding: 'Funding',
  hiring: 'Hiring',
  crm_activity: 'CRM activity',
  news: 'News',
  email: 'Email engagement',
};

function configureWebPush() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    return false;
  }
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    return true;
  } catch (err) {
    console.warn('[signal-alert] VAPID configuration failed:', err.message);
    return false;
  }
}

let vapidConfigured = false;
function ensureVapidConfigured() {
  if (vapidConfigured) return true;
  vapidConfigured = configureWebPush();
  return vapidConfigured;
}

async function sendSignalAlertIfHighPriority(accountId, signalType = 'funding') {
  try {
    const latestScore = await signalsDb.getLatestScore(accountId);
    const score = latestScore ? parseInt(latestScore.score, 10) || 0 : 0;
    if (score < HIGH_PRIORITY_MIN_SCORE) {
      return { sent: false, reason: 'low_priority' };
    }

    const account = await accountsDb.getAccountById(accountId);
    if (!account || !account.rep_id) {
      return { sent: false, reason: 'no_rep' };
    }

    const recent = await signalAlertsDb.getRecentAlertInWindow(accountId, signalType, COOLDOWN_MINUTES);
    if (recent) {
      return { sent: false, reason: 'cooldown' };
    }

    const alert = await signalAlertsDb.insertAlert({
      account_id: accountId,
      rep_id: account.rep_id,
      signal_type: signalType,
      score_at_send: score,
    });

    const subs = await digestBatches.getPushSubscriptions(account.rep_id);
    if (!subs || subs.length === 0) {
      return { sent: true, reason: 'logged_no_subs', alert_id: alert.id };
    }

    if (!ensureVapidConfigured()) {
      return { sent: true, reason: 'logged_no_vapid', alert_id: alert.id };
    }

    const typeLabel = SIGNAL_TYPE_LABELS[signalType] || signalType;
    const payload = JSON.stringify({
      title: `${account.company_name}: new ${typeLabel} signal`,
      body: `Score ${score} pts — tap to review.`,
      tag: `signal-${accountId}-${signalType}`,
      data: {
        account_id: accountId,
        score,
        signal_type: signalType,
        url: '/digest/',
      },
    });

    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      )
    );

    const delivered = results.filter(r => r.status === 'fulfilled').length;
    return { sent: true, alert_id: alert.id, delivered, total: subs.length };
  } catch (err) {
    console.warn('[signal-alert] Failed to send alert:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

async function getRecentAlerts(repId, { hours = 24, limit = 50 } = {}) {
  return signalAlertsDb.getRecentAlertsForRep(repId, { hours, limit });
}

async function getUnreadAlertCount(repId) {
  return signalAlertsDb.getUnreadAlertCount(repId);
}

async function markAlertsRead(repId, alertIds) {
  return signalAlertsDb.markAlertsRead(repId, alertIds);
}

module.exports = {
  sendSignalAlertIfHighPriority,
  getRecentAlerts,
  getUnreadAlertCount,
  markAlertsRead,
  HIGH_PRIORITY_MIN_SCORE,
};
