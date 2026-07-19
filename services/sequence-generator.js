// Sequence template engine — generates 3-step personalized cold email sequences.
// Does NOT send emails (see email-proxy.js for sending).
const AI_URL = process.env.POLSIA_API_URL || 'https://polsia.com/api/proxy/ai';
const AI_KEY = process.env.POLSIA_API_KEY;

// Step labels and send-day offsets
const SEQUENCE_STEPS = [
  { step: 1, label: 'Intro',    sendAfterDays: 0,  description: 'Initial outreach hook' },
  { step: 2, label: 'Value',    sendAfterDays: 3,  description: 'Follow-up with value prop' },
  { step: 3, label: 'CTA',     sendAfterDays: 7,  description: 'Final soft CTA' },
];

async function generateSequence({ companyName, role, painPoint, prospectName, senderName, senderTitle }) {
  if (!AI_KEY) {
    return generateFallbackSequence({ companyName, role, painPoint, prospectName, senderName, senderTitle });
  }

  const name = prospectName || 'there';
  const company = companyName || 'your company';
  const title = role || 'your role';
  const pain = painPoint || 'scaling outbound efficiently';
  const fromName = senderName || 'Alex';
  const fromTitle = senderTitle || 'Co-founder';

  const prompt = `You are a B2B cold email copywriter. Generate a 3-step email sequence for a sales outbound campaign.

Prospect:
- Name: ${name}
- Company: ${company}
- Role/Title: ${title}
- Pain point to address: ${pain}

Sender:
- Name: ${fromName}
- Title: ${fromTitle}

Sequence specs:
- Step 1 (Intro, send Day 0): Hook on something specific to ${company} — a role challenge, industry trend, or company signal. No generic opener.
- Step 2 (Value, send Day 3): Deliver one concrete insight, stat, or mini-case relevant to ${title}s. Value-first.
- Step 3 (CTA, send Day 7): Soft close — no pressure, calendar link or reply CTA, reference previous emails.

Rules:
- Max 150 words per email
- No "I hope you're well", no "cold email", no "reaching out"
- Tone: confident, peer-to-peer, not salesy
- Plain text only — no markdown
- Subject lines must be specific and curiosity-driven, NOT clickbait

Return EXACTLY this format for all 3 steps:
STEP1_SUBJECT: ...
STEP1_BODY: ...
STEP2_SUBJECT: ...
STEP2_BODY: ...
STEP3_SUBJECT: ...
STEP3_BODY: ...

Do not include any other text.`.trim();

  try {
    const res = await fetch(`${AI_URL}/agent/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_KEY}`,
      },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) throw new Error(`AI returned ${res.status}`);
    const { output } = await res.json();
    return parseSequenceOutput(output || '', { companyName, role, painPoint, prospectName, senderName, senderTitle });
  } catch (e) {
    console.error('[sequence-gen] AI failed, using fallback:', e.message);
    return generateFallbackSequence({ companyName, role, painPoint, prospectName, senderName, senderTitle });
  }
}

function parseSequenceOutput(raw, vars) {
  const extract = (key) => {
    const match = raw.match(new RegExp(`${key}:\\n?([\\s\\S]*?)(?=STEP\\d+_|$)`, 'i'));
    return match ? match[1].trim() : null;
  };

  const step1Subj = extract('STEP1_SUBJECT') || defaultSubject(vars.prospectName, 'intro');
  const step2Subj = extract('STEP2_SUBJECT') || defaultSubject(vars.prospectName, 'value');
  const step3Subj = extract('STEP3_SUBJECT') || defaultSubject(vars.prospectName, 'cta');

  const steps = [
    {
      step: 1, label: 'Intro', sendAfterDays: 0,
      subject: step1Subj,
      body: extract('STEP1_BODY') || defaultBody(vars, 'intro'),
    },
    {
      step: 2, label: 'Value', sendAfterDays: 3,
      subject: step2Subj,
      body: extract('STEP2_BODY') || defaultBody(vars, 'value'),
    },
    {
      step: 3, label: 'CTA', sendAfterDays: 7,
      subject: step3Subj,
      body: extract('STEP3_BODY') || defaultBody(vars, 'cta'),
    },
  ];

  return { steps, generatedAt: new Date().toISOString(), vars };
}

function defaultSubject(name, _type) {
  const first = (name || 'there').split(' ')[0];
  return `Quick thought, ${first}`;
}

function defaultBody(vars, type) {
  const first = (vars.prospectName || 'there').split(' ')[0];
  const company = vars.companyName || 'your company';
  const pain = vars.painPoint || 'scaling outbound efficiently';
  const from = vars.senderName || 'Alex';

  if (type === 'intro') {
    return `Hi ${first},

Most ${vars.role || 'sales leaders'} I talk to are running into the same wall — spending hours on research, writing, and sequencing with little to show for it.

${company} is probably dealing with this too. We built SourcemAI to automate the full outbound loop: prospect research, personalized email generation, and warmup rotation — all in one workflow.

Worth a quick 15-min chat if this sounds relevant.

${from}`;
  }
  if (type === 'value') {
    return `Hi ${first},

Following up — wanted to share something that might resonate.

Teams in your space are cutting outbound research time by 70% by automating the persona + pain-point mapping step. Instead of writing from scratch every time, they're working from AI-generated sequences tuned to their ICP.

If you're curious how that would look for ${company}, happy to show you a quick demo.

${from}`;
  }
  // cta
  return `Hi ${first},

One more thing — I've got a few slots left this week for a live walkthrough of how SourcemAI handles the full ${pain} pipeline.

No pitch, just a practical look at the workflow. If it's useful, great. If not, no hard feelings.

Reply here or grab a slot directly: [calendar link]

${from}`;
}

function generateFallbackSequence(vars) {
  return {
    steps: [
      { step: 1, label: 'Intro', sendAfterDays: 0, subject: defaultSubject(vars.prospectName, 'intro'), body: defaultBody(vars, 'intro') },
      { step: 2, label: 'Value', sendAfterDays: 3, subject: defaultSubject(vars.prospectName, 'value'), body: defaultBody(vars, 'value') },
      { step: 3, label: 'CTA',   sendAfterDays: 7, subject: defaultSubject(vars.prospectName, 'cta'),  body: defaultBody(vars, 'cta') },
    ],
    generatedAt: new Date().toISOString(),
    vars,
  };
}

module.exports = { generateSequence, SEQUENCE_STEPS };