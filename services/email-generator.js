// AI email generation — personalized per prospect.
// Tracking: injectTrackingHtml() appends a 1x1 pixel and rewrites hrefs to pass through /api/track/.
async function generateProspectEmail(prospect, researchData, icpDescription) {
  const company = prospect.company || 'their company';
  const name = prospect.name || 'there';

  const researchSummary = researchData && Object.keys(researchData).length > 0
    ? formatResearchForPrompt(researchData)
    : '(No research data available — use generic personalized opening)';

  const prompt = `You are a B2B cold email copywriter. Write one highly personalized cold email.

Prospect:
- Name: ${name}
- Company: ${company}
- Title: ${prospect.title || 'unknown'}

Research data:
${researchSummary}

ICP context: ${icpDescription}

Requirements:
- Maximum 150 words (short enough that they actually read it)
- Subject line + email body
- Subject: specific, curious, no clickbait
- Body: 2-3 short paragraphs, personalized hook, clear value prop, single soft CTA
- Use their company name / recent news / role as hook — NOT generic "I hope you're well"
- Never mention "cold email" or "reaching out"
- Tone: confident, direct, peer-to-peer (not salesy)

Return EXACTLY this format (no extra text):
SUBJECT: [the subject line]
BODY: [the email body]

No markdown formatting. Plain text only.
`.trim();

  try {
    const res = await fetch(`${process.env.POLSIA_API_URL || 'https://polsia.com/api/proxy/ai'}/agent/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.POLSIA_API_KEY}`,
      },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) throw new Error(`AI generation failed (${res.status})`);
    const { output } = await res.json();

    const text = (output || '').trim();
    const subjectMatch = text.match(/^SUBJECT:\n?([^\n]+)/i);
    const bodyMatch = text.match(/BODY:\n?([\\S\n\r ]+)/i);

    if (!subjectMatch || !bodyMatch) {
      console.warn('[email-gen] Could not parse output, using fallback');
      return fallbackEmail(prospect);
    }

    const subject = subjectMatch[1].trim();
    const body = bodyMatch[1].trim();

    return {
      subject,
      body,
      html: bodyToHtml(body),
    };
  } catch (e) {
    console.error('[email-gen] Generation failed:', e.message);
    return fallbackEmail(prospect);
  }
}

function formatResearchForPrompt(data) {
  const lines = [];
  if (data.company_size) lines.push(`- Company size: ${data.company_size}`);
  if (data.industry) lines.push(`- Industry: ${data.industry}`);
  if (data.funding_stage) lines.push(`- Funding: ${data.funding_stage}`);
  if (data.key_product) lines.push(`- Product: ${data.key_product}`);
  if (data.recent_news) lines.push(`- Recent news: ${data.recent_news}`);
  if (data.pain_points && data.pain_points.length) lines.push(`- Pain points: ${data.pain_points.join(', ')}`);
  if (data.trigger_events && data.trigger_events.length) lines.push(`- Trigger events: ${data.trigger_events.join(', ')}`);
  if (data.linkedin_activity) lines.push(`- Recent LinkedIn: ${data.linkedin_activity}`);
  return lines.length ? lines.join('\n') : '(no research data)';
}

function buildTrackingPixel(trackingUuid) {
  const appUrl = process.env.APP_URL || 'https://sourcemai.polsia.app';
  return `<img src="${appUrl}/api/track/open/${trackingUuid}" width="1" height="1" alt="" style="display:none" />`;
}

function wrapLinksWithTracking(html, trackingUuid) {
  const appUrl = process.env.APP_URL || 'https://sourcemai.polsia.app';
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (_match, url) => {
    const encodedUrl = encodeURIComponent(url);
    return `href="${appUrl}/api/track/click/${trackingUuid}?url=${encodedUrl}"`;
  });
}

function injectTrackingHtml(html, trackingUuid) {
  const pixel = buildTrackingPixel(trackingUuid);
  const wrapped = wrapLinksWithTracking(html, trackingUuid);
  return wrapped + pixel;
}

function bodyToHtml(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

function fallbackEmail(prospect) {
  const company = prospect.company || 'your team';
  return {
    subject: `Quick note, ${prospect.name.split(' ')[0]}`,
    body: `Hi ${prospect.name.split(' ')[0]},\n\nI noticed ${company} and thought there might be a fit.\n\nWe're helping companies like yours solve [problem]. Happy to share more if there's interest.\n\nBest,\n[Your name]`,
    html: bodyToHtml(`Hi ${prospect.name.split(' ')[0]},\n\nI noticed ${company} and thought there might be a fit.\n\nWe're helping companies like yours solve [problem]. Happy to share more if there's interest.\n\nBest,\n[Your name]`),
  };
}

module.exports = { generateProspectEmail, injectTrackingHtml };