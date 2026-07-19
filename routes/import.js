// Data import routes — preview, upload (csv/xlsx), commit (CSV/Sheets), async poll.
const express = require('express');
const router = express.Router();
const { requireRep } = require('../middleware/auth');
const importSvc = require('../services/import');
const importRuns = require('../db/import-runs');
const audit = require('../services/audit');
const rateLimit = require('../middleware/rate-limit');

const SAMPLE_CSV =
  'company_name,domain,industry,employee_count,annual_revenue,tech_stack,notes,contact_email,rep_email\n' +
  'Acme,acme.com,SaaS,120,12000000,"stripe,aws,segment",Late-stage exploring,alex@acme.com,lisa@sourcem.ai\n' +
  'Globex,globex.io,Fintech,60,5000000,"plaid,snowflake",Series B,priya@globex.io,lisa@sourcem.ai\n' +
  'Initech,initech.co,Analytics,340,42000000,"looker,dbt,postgres",Public,mark@initech.co,lisa@sourcem.ai\n';

router.post('/preview', requireRep, async (req, res) => {
  const { text, mode = 'csv' } = req.body || {};
  if (!text) return res.status(400).json({ error: 'missing-text' });
  try {
    const result = await importSvc.previewImport(text, mode);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'preview-failed', message: err.message });
  }
});

router.post('/upload', requireRep, async (req, res) => {
  const { filename, content_base64, mapping = {} } = req.body || {};
  if (!filename || !content_base64) return res.status(400).json({ error: 'missing-file' });
  try {
    const buf = Buffer.from(content_base64, 'base64');
    const rows = importSvc.parseUploaded(buf, filename);
    const Papa = require('papaparse');
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const csvText = headers.length ? Papa.unparse({ fields: headers, data: rows.map(r => headers.map(h => r[h] != null ? r[h] : '')) }) : '';
    const preview = await importSvc.previewImport(csvText, 'csv');
    res.json({
      filename,
      headers: preview.headers,
      mapping: { ...preview.mapping, ...mapping },
      preview: preview.preview,
      total: preview.total,
      runId: null,
      text: csvText
    });
  } catch (err) {
    res.status(400).json({ error: 'upload-failed', message: err.message });
  }
});

router.get('/sample.csv', (_req, res) => {
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="sample-accounts.csv"');
  res.send(SAMPLE_CSV);
});

const importLimiter = rateLimit.byRep(10, 60 * 1000);

router.post('/commit', requireRep, importLimiter, async (req, res) => {
  const { text, mode = 'csv', mapping = {}, source } = req.body || {};
  if (!text) return res.status(400).json({ error: 'missing-text' });
  try {
    const result = await importSvc.commitImport({
      org_id: req.rep.company_id,
      rep_id: req.rep.id,
      text, mode, mapping,
      sourceTag: source || mode
    });
    await audit.record({ req, rep: req.rep }, 'import.commit', {
      metadata: {
        mode,
        inserted: result.inserted,
        updated: result.updated,
        errors: result.errors_count,
        total: result.total,
        async: !!result.async,
        runId: result.runId
      }
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'commit-failed', message: err.message });
  }
});

router.post('/commit-async', requireRep, importLimiter, async (req, res) => {
  const { text, mode = 'csv', mapping = {}, source } = req.body || {};
  if (!text) return res.status(400).json({ error: 'missing-text' });
  try {
    const result = await importSvc.commitImport({
      org_id: req.rep.company_id,
      rep_id: req.rep.id,
      text, mode, mapping,
      sourceTag: source || mode,
      type: 'account'
    });
    await audit.record({ req, rep: req.rep }, 'import.commit-async', {
      metadata: { mode, total: result.total, runId: result.runId }
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'commit-failed', message: err.message });
  }
});

router.get('/run/:runId', requireRep, async (req, res) => {
  try {
    const run = await importRuns.getForOrg(req.params.runId, req.rep.company_id);
    if (!run) return res.status(404).json({ error: 'run-not-found' });
    res.json({
      runId: run.id,
      status: run.status,
      progress: run.progress,
      processed_count: run.processed_count,
      total: run.row_count,
      inserted: run.inserted_count,
      updated: run.updated_count,
      errors_count: run.error_count,
      errors_detail: run.errors_json ? (run.errors_json.slice ? run.errors_json.slice(0, 50) : run.errors_json) : null
    });
  } catch (err) {
    res.status(400).json({ error: 'status-failed', message: err.message });
  }
});

router.post('/sheets', requireRep, importLimiter, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'missing-url' });
  try {
    const result = await importSvc.commitSheetsImport({
      org_id: req.rep.company_id, rep_id: req.rep.id, url
    });
    await audit.record({ req, rep: req.rep }, 'import.sheets', {
      metadata: {
        inserted: result.inserted, updated: result.updated,
        errors: result.errors_count, total: result.total,
        async: !!result.async, runId: result.runId
      }
    });
    res.json(result);
  } catch (err) {
    if (err.message === 'google-not-connected') {
      return res.status(409).json({
        error: 'google-not-connected',
        redirect: '/settings/integrations?provider=gmail&return=/import'
      });
    }
    res.status(400).json({ error: 'sheets-failed', message: err.message });
  }
});

module.exports = router;
