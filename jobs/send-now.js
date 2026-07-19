// Direct trigger script — fires first batch send from within the app.
// Preferred trigger: POST /api/outbound/send-now (HTTP call).
// This script is a fallback for direct local runs with env vars set.
// Usage: DATABASE_URL=... POLSIA_API_KEY=... node jobs/send-now.js
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

const POLSIA_AI_URL = process.env.POLSIA_API_URL || 'https://polsia.com/api/proxy/ai';
const POLSIA_EMAIL_URL = 'https://polsia.com/api/proxy/email';
const POLSIA_API_KEY = process.env.POLSIA_API_KEY;

async function ai(prompt) {
  const res = await fetch(`${POLSIA_AI_URL}/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${POLSIA_API_KEY}` },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`AI failed (${res.status})`);
  const { output } = await res.json();
  return (output || '').trim();
}

async function sendEmail({ to, subject, body }) {
  const res = await fetch(`${POLSIA_EMAIL_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${POLSIA_API_KEY}` },
    body: JSON.stringify({ to, subject, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`Email send failed: ${err.message || err.code || res.statusText}`);
  }
  return res.json();
}

function bodyToHtml(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

function formatResearch(data) {
  const lines = [];
  if (data.company_size) lines.push(`- Company size: ${data.company_size}`);
  if (data.industry) lines.push(`- Industry: ${data.industry}`);
  if (data.funding_stage) lines.push(`- Funding: ${data.funding_stage}`);
  if (data.key_product) lines.push(`- Product: ${data.key_product}`);
  if (data.recent_news) lines.push(`- Recent news: ${data.recent_news}`);
  return lines.length ? lines.join('\n') : '(no research data — use generic personalized opening)';
}

async function generateEmail(prospect, icpDescription) {
  const company = prospect.company || 'their company';
  const name = prospect.name || 'there';
  const research = prospect.icp_data ? formatResearch(prospect.icp_data) : '(no research data — use generic personalized opening)';

  const prompt = `You are a B2B cold email copywriter. Write one highly personalized cold email.

Prospect:
- Name: ${name}
- Company: ${company}
- Title: ${prospect.title || 'unknown'}

Research data:
${research}

ICP context: ${icpDescription}

Requirements:
- Maximum 150 words
- Subject line + email body
- Subject: specific, curious, no clickbait
- Body: 2-3 short paragraphs, personalized hook, clear value prop, single soft CTA
- Use their company name / recent news / role as hook — NOT generic "I hope you're well"
- Never mention "cold email" or "reaching out"
- Tone: confident, direct, peer-to-peer (not salesy)

Return EXACTLY this format (no extra text):
SUBJECT: [the subject line]
BODY: [the email body]

No markdown formatting. Plain text only.`.trim();

  try {
    const text = await ai(prompt);
    const subjectMatch = text.match(/^SUBJECT:\n?([^\n]+)/i);
    const bodyMatch = text.match(/BODY:\n?([\n\r ]+)/i);

    if (subjectMatch && bodyMatch) {
      return { subject: subjectMatch[1].trim(), body: bodyMatch[1].trim() };
    }
  } catch (e) {
    console.warn(`[send-now] AI generation failed for ${prospect.email}: ${e.message}`);
  }

  // Fallback
  return {
    subject: `Quick note, ${name.split(' ')[0]}`,
    body: `Hi ${name.split(' ')[0]},\n\nI noticed ${company} and thought there might be a fit.\n\nWe're helping companies like yours get more from their data. Happy to share more if there's interest.\n\nBest`,
  };
}

async function main() {
  console.log('[send-now] Starting first batch send...');

  // Get active campaign + primary email account
  const campaignRow = await pool.query("SELECT * FROM campaigns WHERE status = 'active' LIMIT 1");
  if (!campaignRow.rows.length) { console.error('No active campaign'); process.exit(1); }
  const campaign = campaignRow.rows[0];

  const accountRow = await pool.query('SELECT * FROM email_accounts WHERE is_primary = true LIMIT 1');
  if (!accountRow.rows.length) { console.error('No primary email account'); process.exit(1); }
  const account = accountRow.rows[0];

  // Check today's count
  const sentToday = await pool.query(
    `SELECT COUNT(*) FROM sent_emails WHERE campaign_id = $1 AND sent_at > CURRENT_DATE`,
    [campaign.id]
  );
  const sentCount = parseInt(sentToday.rows[0].count, 10);
  if (sentCount >= campaign.daily_limit) {
    console.log(`[send-now] Daily limit reached (${sentCount}/${campaign.daily_limit}) — nothing to do`);
    return;
  }

  const remaining = campaign.daily_limit - sentCount;

  // Get uncontacted prospects (not already in sent_emails for this campaign)
  const prospectsRow = await pool.query(
    `SELECT p.* FROM prospects p
     WHERE p.status = 'uncontacted'
     AND NOT EXISTS (SELECT 1 FROM sent_emails se WHERE se.prospect_id = p.id AND se.campaign_id = $1)
     ORDER BY p.created_at LIMIT $2`,
    [campaign.id, remaining]
  );
  const prospects = prospectsRow.rows;
  if (!prospects.length) { console.log('[send-now] No uncontacted prospects — nothing to do'); return; }

  console.log(`[send-now] Sending to ${prospects.length} prospects via ${account.email_address}`);

  let sent = 0;
  let failed = 0;

  for (const prospect of prospects) {
    try {
      console.log(`[send-now] Generating email for ${prospect.name} (${prospect.email})...`);
      const email = await generateEmail(prospect, campaign.icp_description);
      console.log(`[send-now]   Subject: ${email.subject}`);

      console.log(`[send-now]   Sending...`);
      const result = await sendEmail({
        to: prospect.email,
        subject: email.subject,
        body: email.body,
      });

      const polsiaEmailId = result.email_id || result.id || 'unknown';

      // Record sent email
      await pool.query(
        `INSERT INTO sent_emails (prospect_id, campaign_id, email_account_id, subject, body, ai_generated, polsia_email_id, sent_at)
         VALUES ($1, $2, $3, $4, $5, true, $6, NOW())`,
        [prospect.id, campaign.id, account.id, email.subject, email.body, polsiaEmailId]
      );

      // Mark prospect status
      await pool.query('UPDATE prospects SET status = $1, updated_at = NOW() WHERE id = $2', ['emails_sent', prospect.id]);

      console.log(`[send-now]   Sent! (polsia_email_id: ${polsiaEmailId})`);
      sent++;
    } catch (e) {
      console.error(`[send-now]   FAILED for ${prospect.email}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n[sende-now] Done. Sent: ${sent}, Failed: ${failed}, Total prospects: ${prospects.length}`);
}

main().catch(err => {
  console.error('[send-now] Fatal:', err);
  process.exit(1);
});