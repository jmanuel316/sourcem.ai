// Daily digest generator — builds ranked account batches for each rep.
const digestBatches = require('../db/digest-batches');
const signals = require('../db/signals');
const reps = require('../db/reps');
const pool = require('../db/index');

function buildWhyOneLiner(account) {
  const parts = [];
  if (account.funding_score > 0) parts.push(`Recent funding (${account.funding_score}pts)`);
  if (account.hiring_score > 0) parts.push(`Hiring GTM roles (${account.hiring_score}pts)`);
  if (account.crm_score > 0) parts.push(`CRM activity spike (${account.crm_score}pts)`);
  if (account.email_score > 0) parts.push(`Email engagement (${account.email_score}pts)`);
  if (!parts.length) return `${account.company_name} showed elevated intent signals.`;
  return `${account.company_name}: ${parts.join(' · ')}.`;
}

function buildRecommendedAction(account) {
  if (account.funding_score >= 3) return `Follow up — funding round means new budget allocation.`;
  if (account.hiring_score >= 2) return `Reach out — expanding GTM team, likely buying enablement.`;
  if (account.crm_score >= 2) return `Check in — CRM activity suggests decision process active.`;
  if (account.email_score >= 3) return `Reach out now — prospect opened and clicked recent email.`;
  if (account.score >= 2) return `Send outreach — account shows buying intent signals.`;
  return `Review account — minor signal activity detected.`;
}

async function generateDigestForRep(repId) {
  const today = new Date().toISOString().split('T')[0];

  // Pull ranked accounts (score >= 1)
  const accounts = await signals.getRankedAccounts({ repId, minScore: 1, limit: 20 });

  // Create or get today's batch
  const batch = await digestBatches.getOrCreateBatch(repId, today);

  // Clear pending entries for this batch
  await pool.query('DELETE FROM digest_entries WHERE batch_id = $1', [batch.id]);

  // Build entries
  const entries = accounts.map(a => ({
    account_id: a.id,
    contact_id: a.contact_id || null,
    score: a.score,
    priority: a.priority || 'medium',
    why_one_liner: buildWhyOneLiner(a),
    recommended_action: buildRecommendedAction(a),
  }));

  const inserted = await digestBatches.insertEntries(batch.id, entries);
  await digestBatches.publishBatch(batch.id);

  return { batch, entries: inserted };
}

async function generateAllDigests() {
  const allReps = await reps.getAllReps();
  const results = [];
  for (const rep of allReps) {
    try {
      const result = await generateDigestForRep(rep.id);
      results.push({ rep_id: rep.id, rep_name: rep.name, ...result });
    } catch (err) {
      console.error(`[digest] Failed for rep ${rep.id} (${rep.name}): ${err.message}`);
    }
  }
  return results;
}

module.exports = { generateDigestForRep, generateAllDigests };