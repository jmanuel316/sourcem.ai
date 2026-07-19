// Nightly hiring signal ingestion via Greenhouse and Lever public job APIs.
// Triggered by polsia.toml [[crons]] at 1:30 AM UTC.
// No API key required — both endpoints are public.
require('../db/index');
const { upsertHiringSignal } = require('../db/hiring-signals');
const { startRun, finishRun } = require('../db/pipeline-runs');

const GREENHOUSE_API = 'https://boards-api.greenhouse.io/v1/boards';
const LEVER_API = 'https://api.lever.co/v0/postings';

const BUYING_INTENT_KEYWORDS = [
  'vp sales', 'vp of sales', 'head of sales', 'head of revenue',
  'chief revenue', 'cro', 'director of sales', 'sales director',
  'account executive', 'sales development', 'sdr', 'bdr',
  'business development rep', 'revenue operations',
];

function matchesBuyingIntent(title) {
  const lower = title.toLowerCase();
  return BUYING_INTENT_KEYWORDS.some(kw => lower.includes(kw));
}

function classifySeniority(title) {
  const lower = title.toLowerCase();
  if (['cro', 'chief revenue', 'vp sales', 'vp of sales', 'head of sales', 'head of revenue'].some(kw => lower.includes(kw))) return 'executive';
  if (['director', 'senior manager'].some(kw => lower.includes(kw))) return 'senior';
  if (['account executive', 'sales manager'].some(kw => lower.includes(kw))) return 'mid';
  if (['sdr', 'bdr', 'sales development rep', 'business development rep'].some(kw => lower.includes(kw))) return 'entry';
  return null;
}

function deriveSlug(domain) {
  const stripped = domain.replace(/^www\./, '');
  return stripped.split('.')[0];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchGreenhouseJobs(slug) {
  const res = await fetch(`${GREENHOUSE_API}/${slug}/jobs?content=false`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Greenhouse ${res.status} for ${slug}`);
  const data = await res.json();
  return (data.jobs || []).map(job => ({
    title: job.title || '',
    posted_date: job.updated_at ? job.updated_at.split('T')[0] : null,
    source_url: `https://boards.greenhouse.io/${slug}/jobs/${job.id}`,
    raw_json: job,
  }));
}

async function fetchLeverJobs(slug) {
  const res = await fetch(`${LEVER_API}/${slug}?mode=json`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Lever ${res.status} for ${slug}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map(posting => ({
    title: posting.text || '',
    posted_date: posting.createdAt ? new Date(posting.createdAt).toISOString().split('T')[0] : null,
    source_url: posting.hostedUrl || null,
    raw_json: posting,
  }));
}

async function main() {
  const runId = await startRun('hiring');
  try {
    const start = Date.now();
    console.log('[ingest-hiring-signals] Starting hiring signal ingestion...');

    const pool = require('../db/index');
    const { rows: accounts } = await pool.query(
      `SELECT company_name, domain FROM accounts WHERE is_active = TRUE`
    );
    console.log(`[ingest-hiring-signals] Fetched ${accounts.length} accounts`);

    let inserted = 0;
    let skipped = 0;
    let firstInnerError = null;

    for (const account of accounts) {
      if (!account.domain) continue;
      const slug = deriveSlug(account.domain);

      try {
        const [ghJobs, levJobs] = await Promise.all([
          fetchGreenhouseJobs(slug).catch(err => {
            console.warn(`[ingest-hiring-signals] Greenhouse warn (${slug}): ${err.message}`);
            return [];
          }),
          fetchLeverJobs(slug).catch(err => {
            console.warn(`[ingest-hiring-signals] Lever warn (${slug}): ${err.message}`);
            return [];
          }),
        ]);

        const jobs = [...ghJobs, ...levJobs];

        for (const job of jobs) {
          if (!job.title || !matchesBuyingIntent(job.title) || !job.source_url) continue;
          const row = await upsertHiringSignal({
            company_name: account.company_name,
            role_title: job.title,
            seniority: classifySeniority(job.title),
            posted_date: job.posted_date,
            source_url: job.source_url,
            raw_json: job.raw_json,
          });
          if (row) inserted++;
          else skipped++;
        }
      } catch (err) {
        if (!firstInnerError) firstInnerError = err.message;
        console.warn(`[ingest-hiring-signals] Error processing ${account.company_name}: ${err.message}`);
      }

      await sleep(800);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[ingest-hiring-signals] Inserted ${inserted} new, skipped ${skipped} duplicates`);
    console.log(`[ingest-hiring-signals] Done in ${elapsed}s`);

    if (firstInnerError && inserted === 0) {
      console.error(`[ingest-hiring-signals] All upserts failed — first error: ${firstInnerError}`);
      await finishRun(runId, { status: 'error', error_message: firstInnerError, rows_inserted: 0, rows_skipped: skipped });
      process.exit(1);
    }
    await finishRun(runId, { rows_inserted: inserted, rows_skipped: skipped, status: 'success' });
    process.exit(0);
  } catch (err) {
    console.error('[ingest-hiring-signals] Fatal:', err);
    await finishRun(runId, { status: 'error', error_message: err.message, rows_inserted: 0, rows_skipped: 0 });
    process.exit(1);
  }
}

main();

module.exports = { classifySeniority, deriveSlug, matchesBuyingIntent };
