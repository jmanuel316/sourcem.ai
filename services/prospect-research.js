// AI prospect research using Polsia Agent SDK.
// Uses web search MCP to gather real-time company/individual data.
async function researchProspect(prospect) {
  const prompt = `
You are a sales researcher. Research the following prospect and return structured data.

Prospect: ${prospect.name}
Company: ${prospect.company || 'unknown'}
Title: ${prospect.title || 'unknown'}
LinkedIn: ${prospect.linkedin_url || 'not provided'}

Tasks:
1. Search for the company to find: size (employees), industry, recent news, funding stage, key products
2. If LinkedIn provided, search for recent activity or mutual connections
3. Identify any recent pain points or triggers (layoffs, funding rounds, leadership changes, news)
4. Find the prospect's recent tweets/posts if publicly available

Return a JSON object with this exact shape (fill in null if data not found):
{
  "company_size": "50-200" or null,
  "industry": "SaaS / Fintech / etc" or null,
  "funding_stage": "Series A / Series B / IPO / Bootstrapped / unknown" or null,
  "key_product": "what they sell" or null,
  "recent_news": "brief summary of notable recent news" or null,
  "pain_points": ["point 1", "point 2"],
  "trigger_events": ["recent layoffs", "recent funding", "leadership change"],
  "linkedin_activity": "recent post summary or null" or null
}

Only return valid JSON. No preamble, no explanation.
`.trim();

  try {
    const res = await fetch(`${process.env.POLSIA_API_URL || 'https://polsia.com/api/proxy/ai'}/agent/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.POLSIA_API_KEY}`,
      },
      body: JSON.stringify({
        prompt,
        mcpServers: ['web_search'],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Agent run failed (${res.status}): ${text}`);
    }

    const { output, error } = await res.json();

    if (error) {
      console.error('[research] Agent error:', error);
      return {};
    }

    // Parse the JSON output from the agent
    let parsed = {};
    try {
      // Agent returns text — try to extract JSON from it
      const cleaned = output.replace(/```json\n?|```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // If JSON parse fails, try to extract key fields from text
      console.warn('[research] Could not parse agent JSON output, returning empty');
      return {};
    }

    // Validate we got useful data
    const hasData = Object.values(parsed).some(v => v !== null && v !== undefined && v !== '');
    return hasData ? parsed : {};
  } catch (e) {
    console.error('[research] Research failed:', e.message);
    return {};
  }
}

// Discover new prospects matching an ICP using the agent
async function discoverProspects(icpDescription, limit = 20) {
  const prompt = `
You are a B2B sales prospect researcher. Find ${limit} real people who match this Ideal Customer Profile:

ICP: ${icpDescription}

Tasks:
1. Identify companies and roles that match the ICP
2. Find real people — give their name, company, title, and LinkedIn profile if available
3. Focus on people who are likely to be in buying roles (Founder, VP Sales, Head of Growth, CTO, etc.)
4. For each person, note why they match the ICP

Return a JSON array of prospects (max ${limit}):
[
  {
    "name": "Full Name",
    "email": "best-guess@company.com",
    "company": "Company Name",
    "title": "Job Title",
    "linkedin_url": "https://linkedin.com/in/...",
    "match_reason": "why this person fits the ICP"
  }
]

Only return valid JSON. No explanation outside the array.
`.trim();

  try {
    const res = await fetch(`${process.env.POLSIA_API_URL || 'https://polsia.com/api/proxy/ai'}/agent/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.POLSIA_API_KEY}`,
      },
      body: JSON.stringify({
        prompt,
        mcpServers: ['web_search'],
      }),
    });

    if (!res.ok) throw new Error(`Agent run failed (${res.status})`);
    const { output } = await res.json();

    let parsed = [];
    try {
      const cleaned = output.replace(/```json\n?|```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.warn('[research] Could not parse discovered prospects JSON');
      return [];
    }

    return Array.isArray(parsed) ? parsed.slice(0, limit) : [];
  } catch (e) {
    console.error('[research] Discovery failed:', e.message);
    return [];
  }
}

module.exports = { researchProspect, discoverProspects };