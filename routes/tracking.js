// Tracking pixel endpoints — open (pixel), click (redirect), bounce webhook.
const express = require('express');
const router = express.Router();
const { recordEvent } = require('../db/email-tracking');
const sentEmails = require('../db/sent-emails');
const { addEngagementPoint } = require('../db/prospect-engagement');

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

async function recordFromTrackingUuid(trackingUuid, eventType, eventData, req) {
  const sent = await sentEmails.getSentEmailByUuid(trackingUuid);
  if (!sent) return;
  await recordEvent({
    sentEmailId: sent.id,
    eventType,
    eventData,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  if (sent.prospect_id && (eventType === 'open' || eventType === 'click')) {
    addEngagementPoint(sent.prospect_id, eventType).catch(err =>
      console.error('[tracking] engagement point update failed:', err.message)
    );
  }
}

// GET /api/track/open/:trackingUuid — 1x1 transparent pixel
router.get('/open/:trackingUuid', async (req, res) => {
  try {
    await recordFromTrackingUuid(req.params.trackingUuid, 'open', {}, req);
  } catch (e) {
    console.error('[tracking] open event record failed:', e.message);
  }

  res.set({
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Length': PIXEL.length,
  });
  res.end(PIXEL);
});

// GET /api/track/click/:trackingUuid?url=https://... — redirect with click logging
router.get('/click/:trackingUuid', async (req, res) => {
  const redirectUrl = req.query.url;
  if (!redirectUrl) return res.redirect('/');

  try {
    const dest = decodeURIComponent(redirectUrl);
    await recordFromTrackingUuid(req.params.trackingUuid, 'click', { destination: dest }, req);
  } catch (e) {
    console.error('[tracking] click event record failed:', e.message);
  }

  res.redirect(302, redirectUrl);
});

// POST /api/webhook/bounce — Polsia Email Proxy bounce notifications
router.post('/bounce', async (req, res) => {
  const { email_id, bounce_type, reason, to } = req.body;
  console.log(`[tracking] bounce: ${bounce_type} — ${reason}`);
  if (!email_id) return res.status(400).json({ error: 'email_id required' });

  try {
    const sent = await sentEmails.getSentEmailByPolsiaId(email_id);
    if (sent) {
      await recordEvent({
        sentEmailId: sent.id,
        eventType: 'bounce',
        eventData: { bounce_type, reason, to },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }
  } catch (e) {
    console.error('[tracking] bounce record failed:', e.message);
  }

  res.json({ received: true });
});

module.exports = router;