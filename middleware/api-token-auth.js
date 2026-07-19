// API-token auth — Bearer token middleware for public API consumers.
const tokens = require('../db/api-tokens');

function apiTokenAuth(req, res, next) {
  if (process.env.SOURCEMAI_API_TOKENS_ENABLED !== 'true') return next();
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    req.apiToken = null;
    return next();
  }
  const raw = auth.slice('Bearer '.length);
  tokens.findByToken(raw).then(t => {
    if (!t) return res.status(401).json({ error: 'invalid-token' });
    req.apiToken = t;
    req.rep = { id: null, company_id: t.org_id, role: 'api' };
    next();
  }).catch(() => next());
}

module.exports = apiTokenAuth;
