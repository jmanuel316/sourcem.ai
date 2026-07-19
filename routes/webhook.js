// Inbound email webhook from Polsia Email Proxy.
// Triggers intent classifier (interested/not_interested/off_topic/unsubscribe/etc.)
// and routes accordingly — CRM tags, status updates, unsubscribe prompt emails.
const express = require('express');
const router = express.Router();
const replies = require('../db/replies');
const sentEmails = require('../db/sent-emails');
const prospects = require('../db/prospects');
const emailAccounts = require('../db/email-accounts');
const { categorizeReply } = require('../services/reply-categorizer');
const { sendEmail } = require('../services/email-proxy');
const { computeEngagementScore } = require('../db/prospect-engagement');

// CRM routing targets per intent
const CRM_ROUTES = {
  interested: 'high_priority_leads',
  not_interested: 'not_interested_queue',
  off_topic: 'off_topic_queue',
  unsubscribe: 'unsubscribed_list',
  out_of_office: 'back_in_office_queue',
  bounce: 'bounce_log',
};

// Prospect status updates per intent
const PROSPECT_STATUS_MAP = {
  interested: 'replied_interested',
  not_interested: 'replied_not_interested',
  off_topic: 'off_topic',
  unsubscribe: 'unsubscribed',
};

router.post('/email', async (req, res) => {
  const { from, subject, text_body, html_body, email_id } = req.body;

  if (!from || !subject) {
    return res.status(400).json({ error: 'from and subject required' });
  }

  console.log(`[webhook] Inbound email from ${from}: ${subject}`);

  const fromEmail = from.includes('<') ? from.match(/<([^>]+)>/)[1] : from;

  const existingProspect = await prospects.getProspectByEmail(fromEmail);
  if (!existingProspect) {
    console.log(`[webhook] Unrecognized sender ${fromEmail} — skipping`);
    return res.json({ processed: false, reason: 'unrecognized_sender' });
  }

  const sentEmailList = await sentEmails.getSentEmailsForProspect(existingProspect.id);
  if (!sentEmailList.length) {
    return res.json({ processed: false, reason: 'no_sent_email_found' });
  }
  const latestSent = sentEmailList[0];

  // Run intent classifier
  let category = 'unknown';
  let aiText = '';
  try {
    const result = await categorizeReply({
      subject,
      body: text_body || html_body || '',
      prospectName: existingProspect.name,
      originalSubject: latestSent.subject,
    });
    category = result.category;
    aiText = result.reasoning;
  } catch (e) {
    console.error(`[webhook] AI categorization failed: ${e.message}`);
  }

  // Record reply
  const reply = await replies.createReply({
    sent_email_id: latestSent.id,
    inbound_email_id: email_id,
    category,
    ai_categorization: aiText,
    crm_route_target: CRM_ROUTES[category] || null,
  });

  // Route to CRM
  if (CRM_ROUTES[category]) {
    await replies.markRouted(reply.id, CRM_ROUTES[category]);
  }

  // Update prospect status
  const newStatus = PROSPECT_STATUS_MAP[category];
  if (newStatus) {
    await prospects.updateProspectStatus(existingProspect.id, newStatus);
  }

  // Boost engagement score on positive reply signal
  if (category === 'interested') {
    computeEngagementScore(existingProspect.id)
      .then(score => prospects.updateProspectEngagementScore(existingProspect.id, score))
      .catch(err => console.error('[webhook] engagement score update failed:', err.message));
  }

  // Off-topic → send courteous unsubscribe prompt
  if (category === 'off_topic') {
    sendOffTopicUnsubscribePrompt(existingProspect, latestSent).catch(err => {
      console.error('[webhook] Off-topic unsubscribe prompt failed:', err.message);
    });
  }

  console.log(`[webhook] Intent: ${category} | Prospect ${existingProspect.id} → ${newStatus || 'no status change'}`);
  res.json({ processed: true, category, reply_id: reply.id });
});

async function sendOffTopicUnsubscribePrompt(prospect, sentEmail) {
  const primary = await emailAccounts.getPrimaryEmailAccount();
  const firstName = (prospect.name || 'there').split(' ')[0];

  const body = `Hi ${firstName},

It looks like this email may have reached you by mistake — apologies if that's the case.

If you'd prefer not to receive further messages from us, just reply with "unsubscribe" and we'll remove you from our list right away.

Best,
${primary ? primary.display_name : 'SourcemAI'}`;

  await sendEmail({
    to: prospect.email,
    subject: `Re: ${sentEmail.subject}`,
    body,
    replyToEmailId: sentEmail.polsia_email_id,
  });

  console.log(`[webhook] Sent off-topic unsubscribe prompt to ${prospect.email}`);
}

// Health check
router.get('/email', (_req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router;