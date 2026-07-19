// services/email-proxy.js
const integrationsRegistry = require('../lib/integrations-registry');

// Helper to create human-like pauses between sends
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendThrottledEmail(payload) {
  // Inject Jitter: Delay between 30 and 90 seconds per email send
  const minDelay = 30000;
  const maxDelay = 90000;
  const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  
  await sleep(randomDelay);

  // Resolve the sender account configuration (e.g., Gmail/M365) via integrations registry

  const provider = await integrationsRegistry.getProviderForCampaign(payload.campaignId);
  
  // Hand off to your existing transport configuration
  const result = await provider.send({
    to: payload.email,
    subject: payload.subject || "Contextual Update",
    body: payload.body
  });

  return result;
}

module.exports = { sendThrottledEmail };
