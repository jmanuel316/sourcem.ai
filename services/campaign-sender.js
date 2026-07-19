const campaigns = require('../db/campaigns');
const prospects = require('../db/prospects');
const emailAccounts = require('../db/email-accounts');
const sentEmails = require('../db/sent-emails');
const Queue = require('../db/queue'); // <-- Import our new database queue
const { generateProspectEmail, injectTrackingHtml } = require('./email-generator');
const crypto = require('crypto');
const { researchProspect } = require('./prospect-research');

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

  let enqueuedCount = 0;
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
      // 1. Generate the hyper-personalized AI copy out-of-band
      const emailContent = await generateProspectEmail(prospect, researchData, campaign.icp_description);
      const trackingUuid = crypto.randomUUID();
      const trackedHtml = injectTrackingHtml(emailContent.html, trackingUuid);

      // 2. Insert records into sent_emails to establish immediate DB records
      const dummyPolsiaEmailId = `pending_queue_${crypto.randomUUID()}`; // Temporary ID until worker fires
      await sentEmails.createSentEmail({
        prospect_id: prospect.id,
        campaign_id: campaignId,
        email_account_id: primaryAccount.id,
        subject: emailContent.subject,
        body: emailContent.body,
        ai_generated: true,
        polsia_email_id: dummyPolsiaEmailId, 
        tracking_uuid: trackingUuid,
        html_body: trackedHtml,
      });

      // 3. Update prospect state so they aren't scraped by a concurrent cron cycle
      await prospects.updateProspectStatus(prospect.id, 'emails_sent');

      // 4. Drop the complete payload into our resilient database task queue
      await Queue.enqueue('send_outbound_email', {
        to: prospect.email,
        subject: emailContent.subject,
        body: emailContent.body,
        html: trackedHtml,
        fromName: primaryAccount.display_name,
        prospectId: prospect.id,
        campaignId: campaignId
      });

      enqueuedCount++;
    } catch (e) {
      console.error(`Failed to stage and enqueue email for ${prospect.email}: ${e.message}`);
    }
  }

  return { campaign_id: campaignId, enqueued: enqueuedCount, total_prospects: prospectsList.length };
}

module.exports = { runCampaignSend };
