// Structured logger — JSON output, no PII in plain text fields.
const crypto = require('crypto');

function newRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

function log(level, msg, ctx = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    requestId: ctx.requestId,
    rep_id: ctx.rep ? ctx.rep.id : undefined,
    org_id: ctx.rep ? ctx.rep.company_id : undefined
  };
  // Remove undefined / empty keys to keep logs clean.
  for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];
  console.log(JSON.stringify(entry));
}

// Express middleware — attach requestId to req, log request start/end.
function requestLogger() {
  return (req, res, next) => {
    req.requestId = req.headers['x-request-id'] || newRequestId();
    res.setHeader('x-request-id', req.requestId);
    log('info', 'request.start', { requestId: req.requestId });
    const start = Date.now();
    res.on('finish', () => {
      log('info', 'request.end', {
        requestId: req.requestId,
        status: res.statusCode,
        duration_ms: Date.now() - start,
        url: req.originalUrl
      });
    });
    next();
  };
}

module.exports = { log, requestLogger, newRequestId };
