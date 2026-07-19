// Daily outbound send job.
// Triggered by polsia.toml [[crons]] — runs once per day.
const { runCampaignSend } = require('../services/campaign-sender');
const campaigns = require('../db/campaigns');
const prospects = require('../db/prospects');
const { computeEngagementScore } = require('../db/prospect-engagement');

async function refreshEngagementScores(campaignId) {
  const campaignProspects = await prospects.getProspectsByCampaign(campaignId);
  for (const p of campaignProspects) {
    const score = await computeEngagementScore(p.id);
    await prospects.updateProspectEngagementScore(p.id, score);
  }
  console.log(`[daily-send] Refreshed engagement scores for ${campaignProspects.length} prospects in campaign ${campaignId}`);
}

async function main() {
  console.log('[daily-send] Starting daily send job');

  const activeCampaigns = await campaigns.getActiveCampaigns();
  if (!activeCampaigns.length) {
    console.log('[daily-send] No active campaigns — nothing to do');
    return;
  }

  let totalSent = 0;
  for (const campaign of activeCampaigns) {
    try {
      await refreshEngagementScores(campaign.id);
      const result = await runCampaignSend(campaign.id, campaign.daily_limit);
      console.log(`[daily-send] Campaign ${campaign.id} (${campaign.name}): sent ${result.sent}`);
      totalSent += result.sent || 0;
    } catch (e) {
      console.error(`[daily-send] Campaign ${campaign.id} failed: ${e.message}`);
    }
  }

  console.log(`[daily-send] Done. Total sent: ${totalSent}`);
}

main().catch(err => {
  console.error('[daily-send] Fatal:', err);
  process.exit(1);
});