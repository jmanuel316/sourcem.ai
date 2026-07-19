// Standalone campaign send — no Express dependency.
// Exported for server.js boot trigger and jobs/daily-send.js.
// Does NOT import from routes/ to avoid circular module initialization.
const campaigns = require('../db/campaigns');
const prospects = require('../db/prospects');
const emailAccounts = require('../db/email-accounts');
const sentEmails = require('../db/sent-emails');
const { generateProspectEmail, injectTrackingHtml } = require('./email-generator');
const crypto = require('crypto');
const { researchProspect } = require('./prospect-research');
const { sendEmail } = require('./email-proxy');

async function runCampaignSend(campaignId, maxSend) {
  const campaign = await campaigns.getCampaignById(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'active') throw new Error('Campaign is not active');

  const sentToday = await campaigns.getCampaignsSentToday(campaignId);
  if (sentToday >= campaign.daily_limit) {
    return { campaign_id: campaignId, sent: 0, message: 'daily limit reached' };
  }

  const remaining = campaign.daily_limit - sentToday;
  const toSend = Math.min(maxSend || remaining, remaining);

  const prospectsList = await prospects.getUncontactedProspects(campaignId, toSend);
  if (!prospectsList.length) return { campaign_id: campaignId, sent: 0, message: 'no prospects to contact' };

  const primaryAccount = await emailAccounts.getPrimaryEmailAccount();
  if (!primaryAccount) throw new Error('No primary email account configured');

  let sent = 0;
  for (const prospect of prospectsList) {
    let researchData = prospect.icp_data || {};

    if (!researchData.company_size && !researchData.industry && !researchData.funding) {
      try {
        researchData = await researchProspect(prospect);
        if (Object.keys(researchData).length > 0) {
          await prospects.updateProspectIcpData(prospect.id, researchData);
        }
      } catch (e) {
        console.error(`Research failed for ${prospect.email}: ${e.message}`);
      }
    }

    try {
      const emailContent = await generateProspectEmail(prospect, researchData, campaign.icp_description);
      const trackingUuid = crypto.randomUUID();
      const trackedHtml = injectTrackingHtml(emailContent.html, trackingUuid);

      const polsiaEmailId = await sendEmail({
        to: prospect.email,
        subject: emailContent.subject,
        body: emailContent.body,
        html: trackedHtml,
        fromName: primaryAccount.display_name,
      });

      await sentEmails.createSentEmail({
        prospect_id: prospect.id,
        campaign_id: campaignId,
        email_account_id: primaryAccount.id,
        subject: emailContent.subject,
        body: emailContent.body,
        ai_generated: true,
        polsia_email_id: polsiaEmailId,
        tracking_uuid: trackingUuid,
        html_body: trackedHtml,
      });

      await prospects.updateProspectStatus(prospect.id, 'emails_sent');
      sent++;
    } catch (e) {
      console.error(`Send failed for ${prospect.email}: ${e.message}`);
    }
  }

  return { campaign_id: campaignId, sent, total_prospects: prospectsList.length };
}

module.exports = { runCampaignSend };