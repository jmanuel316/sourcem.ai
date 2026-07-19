const Queue = require('../db/queue');

async function triggerCampaign(campaignId, prospects) {
  for (const prospect of prospects) {
    const taskPayload = {
      campaignId: campaignId,
      prospectId: prospect.id,
      email: prospect.email,
      name: prospect.name
    };

    // Stage the task to be picked up by our throttled background runner
    await Queue.enqueue('send_outbound_email', taskPayload);
  }
  
  return { success: true, enqueuedCount: prospects.length };
}

module.exports = { triggerCampaign };
