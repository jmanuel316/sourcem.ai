// Email deliverability health check — checks proxy connectivity and DNS records.
const express = require('express');
const dns = require('dns');
const router = express.Router();

const POLSIA_EMAIL_BASE = 'https://polsia.com/api/proxy/email';

router.get('/email', async (req, res) => {
  const results = {
    smtp_credentials: { status: 'fail', detail: null },
    spf_record: { status: 'fail', detail: null },
    dkim_record: { status: 'fail', detail: null },
  };

  // 1. SMTP / proxy reachability — call /inbox which proves credentials are valid
  try {
    if (!process.env.POLSIA_API_KEY) {
      results.smtp_credentials.detail = 'POLSIA_API_KEY not configured';
    } else {
      const probe = await fetch(`${POLSIA_EMAIL_BASE}/inbox`, {
        headers: { Authorization: `Bearer ${process.env.POLSIA_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (probe.ok) {
        results.smtp_credentials.status = 'pass';
        results.smtp_credentials.detail = 'Polsia Email Proxy credentials valid';
      } else {
        results.smtp_credentials.detail = `Proxy returned ${probe.status}`;
      }
    }
  } catch (err) {
    results.smtp_credentials.detail = err.message;
  }

  // 2. SPF record — resolve TXT for sending domain
  const sendingDomain = 'polsia.app';
  try {
    const txt = await new Promise((resolve, reject) => {
      dns.resolveTxt(sendingDomain, (err, records) => {
        if (err) return reject(err);
        resolve(records);
      });
    });
    const spfRecord = txt.flat().find((r) => r.startsWith('v=spf1'));
    if (spfRecord) {
      results.spf_record.status = 'pass';
      results.spf_record.detail = spfRecord;
    } else {
      results.spf_record.detail = 'No SPF TXT record found for ' + sendingDomain;
    }
  } catch (err) {
    results.spf_record.detail = `DNS lookup failed: ${err.code || err.message}`;
  }

  // 3. DKIM record — resolve TXT for Polsia selector (default selector)
  const dkimDomain = 'polsia._domainkey.polsia.app';
  try {
    const txt = await new Promise((resolve, reject) => {
      dns.resolveTxt(dkimDomain, (err, records) => {
        if (err) return reject(err);
        resolve(records);
      });
    });
    const dkimRecord = txt.flat().find((r) => r.startsWith('v=DKIM1'));
    if (dkimRecord) {
      results.dkim_record.status = 'pass';
      results.dkim_record.detail = dkimRecord;
    } else {
      results.dkim_record.detail = 'No DKIM TXT record found for ' + dkimDomain;
    }
  } catch (err) {
    results.dkim_record.detail = `DNS lookup failed: ${err.code || err.message}`;
  }

  const allPass = ['smtp_credentials', 'spf_record', 'dkim_record'].every(
    (k) => results[k].status === 'pass'
  );
  res.status(allPass ? 200 : 503).json({
    healthy: allPass,
    checks: results,
    checked_at: new Date().toISOString(),
  });
});

module.exports = router;